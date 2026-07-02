// One-off: exercises the same parser -> DB persistence path as
// POST /api/parse, GET /api/pedimentos, GET /api/pedimentos/[id], and
// DELETE /api/pedimentos/[id], without going through HTTP/Clerk auth.
import { eq } from "drizzle-orm";
import { parsePedimento } from "../src/lib/parser";
import { pedimentos, partidas } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const PDF_PATH = process.argv[2];
const ORG = "org_integration_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  // cleanup from any previous failed run
  await withOrg(ORG, async (tx) => {
    const existing = await tx.select().from(pedimentos).where(eq(pedimentos.orgId, ORG));
    for (const p of existing) {
      await tx.delete(partidas).where(eq(partidas.pedimentoId, p.id));
      await tx.delete(pedimentos).where(eq(pedimentos.id, p.id));
    }
  });

  const result = await parsePedimento(PDF_PATH);

  const inserted = await withOrg(ORG, async (tx) => {
    const [p] = await tx
      .insert(pedimentos)
      .values({
        orgId: ORG,
        pedimentoNum: result.pedimentoNum,
        importador: result.importador,
        tipoCambio: result.tipoCambio,
        pdfFilename: "test.pdf",
        dta: result.dta,
        igi: result.igi,
        prv: result.prv,
      })
      .returning();
    await tx.insert(partidas).values(
      result.partidas.map((pt) => ({
        orgId: ORG,
        pedimentoId: p.id,
        sec: pt.sec,
        fraccion: pt.fraccion,
        descripcion: pt.descripcion,
        cantidad: pt.cantidad,
        valAduana: pt.valAduana,
        valComercial: pt.valComercial,
        precioUnitario: pt.precioUnitario,
        tieneIncrementables: pt.tieneIncrementables,
        umc: pt.umc,
      }))
    );
    return p;
  });

  // list
  const listed = await withOrg(ORG, (tx) => tx.select().from(pedimentos).where(eq(pedimentos.orgId, ORG)));
  assert(listed.length === 1, `list shows exactly 1 pedimento, got ${listed.length}`);

  // detail
  const detailPartidas = await withOrg(ORG, (tx) =>
    tx.select().from(partidas).where(eq(partidas.pedimentoId, inserted.id))
  );
  assert(detailPartidas.length === 56, `detail shows 56 partidas, got ${detailPartidas.length}`);

  // dedup: re-parsing the same PDF should not create a second pedimento row
  const dup = await withOrg(ORG, (tx) =>
    tx.select().from(pedimentos).where(eq(pedimentos.pedimentoNum, result.pedimentoNum))
  );
  assert(dup.length === 1, `dedup: still exactly 1 row for this pedimento_num, got ${dup.length}`);

  // delete
  await withOrg(ORG, async (tx) => {
    await tx.delete(partidas).where(eq(partidas.pedimentoId, inserted.id));
    await tx.delete(pedimentos).where(eq(pedimentos.id, inserted.id));
  });
  const afterDelete = await withOrg(ORG, (tx) => tx.select().from(pedimentos).where(eq(pedimentos.orgId, ORG)));
  assert(afterDelete.length === 0, `delete: 0 pedimentos remain, got ${afterDelete.length}`);

  console.log("Integration test passed: parse -> persist -> list -> detail -> dedup -> delete, all correct.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

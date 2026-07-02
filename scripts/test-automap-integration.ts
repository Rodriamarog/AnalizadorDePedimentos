// One-off: exercises Phase 7's automap against the real Gemini API (no
// mocks) and real seeded SAT catalog data, then verifies the results land
// in `productos` scoped to a test org, with sane confidence handling.
import { eq } from "drizzle-orm";
import { productos } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";
import { runAutomap } from "../src/lib/automap";

const ORG = "org_automap_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await withOrg(ORG, (tx) => tx.delete(productos).where(eq(productos.orgId, ORG)));

  // Real-world-shaped test partidas (chapter 87 = vehicles/parts, chapter 39 = plastics)
  const partidas = [
    { fraccion: "87089999", descripcion: "PARTES Y ACCESORIOS PARA VEHICULOS AUTOMOVILES" },
    { fraccion: "39235000", descripcion: "TAPONES, TAPAS, CAPSULAS DE PLASTICO" },
  ];

  console.log("Calling Gemini for automap classification (this can take up to ~2 min)...");
  const { classifications, message } = await runAutomap(partidas, new Set());
  assert(!message, `expected no "already mapped" message, got: ${message}`);
  assert(classifications.length === 2, `expected 2 classifications, got ${classifications.length}`);

  for (const c of classifications) {
    console.log(c);
    assert(!!c.fraccion, "classification has a fraccion");
    assert(["high", "medium", "low"].includes(c.confidence), "confidence is one of high/medium/low");
  }

  // Persist the way the route does, then verify.
  await withOrg(ORG, async (tx) => {
    for (const c of classifications) {
      if (!c.key) continue;
      const orig = partidas.find((p) => p.fraccion === c.fraccion)!;
      await tx.insert(productos).values({
        orgId: ORG,
        fraccion: c.fraccion,
        descripcion: orig.descripcion,
        claveProdServ: c.key,
        descripcionSat: c.description,
        unitKey: c.unitKey,
        confidence: c.confidence,
      });
    }
  });

  const saved = await withOrg(ORG, (tx) => tx.select().from(productos).where(eq(productos.orgId, ORG)));
  const mappedCount = classifications.filter((c) => c.key).length;
  assert(saved.length === mappedCount, `expected ${mappedCount} saved rows, got ${saved.length}`);
  for (const row of saved) {
    assert(!!row.claveProdServ, `saved row for ${row.fraccion} has a claveProdServ`);
    assert(!!row.unitKey, `saved row for ${row.fraccion} has a unitKey`);
  }

  // "Already mapped" path: re-running with the fracciones marked as mapped
  // should skip them entirely (no Gemini call needed).
  const alreadyMapped = new Set(saved.map((r) => r.fraccion));
  const rerun = await runAutomap(partidas, alreadyMapped);
  assert(rerun.message === "Todas las fracciones ya están mapeadas", "second run reports all fracciones already mapped");
  assert(rerun.classifications.length === 0, "second run returns no classifications");

  await withOrg(ORG, (tx) => tx.delete(productos).where(eq(productos.orgId, ORG)));

  console.log("Automap integration test passed: real Gemini classification -> persist -> already-mapped skip.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

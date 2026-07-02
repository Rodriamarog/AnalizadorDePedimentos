// One-off verification, not a permanent test suite: proves RLS actually
// blocks cross-org reads/writes, not just that the policy SQL looks right.
// Run with: node --env-file=.env.local scripts/test-rls-isolation.ts
import { eq } from "drizzle-orm";
import { pedimentos } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const ORG_A = "org_test_a";
const ORG_B = "org_test_b";

async function main() {
  let pedimentoId: string;

  await withOrg(ORG_A, async (tx) => {
    const [row] = await tx
      .insert(pedimentos)
      .values({
        orgId: ORG_A,
        pedimentoNum: "TEST-001",
        importador: "Org A Importer",
        tipoCambio: 17.5,
        pdfFilename: "test.pdf",
      })
      .returning({ id: pedimentos.id });
    pedimentoId = row.id;
  });

  const seenByOwner = await withOrg(ORG_A, (tx) =>
    tx.select().from(pedimentos).where(eq(pedimentos.id, pedimentoId))
  );
  if (seenByOwner.length !== 1) {
    throw new Error(`Expected org A to see its own row, got ${seenByOwner.length}`);
  }

  const seenByOther = await withOrg(ORG_B, (tx) =>
    tx.select().from(pedimentos).where(eq(pedimentos.id, pedimentoId))
  );
  if (seenByOther.length !== 0) {
    throw new Error(`RLS LEAK: org B saw ${seenByOther.length} row(s) belonging to org A`);
  }

  let crossOrgWriteBlocked = false;
  try {
    await withOrg(ORG_B, (tx) =>
      tx.update(pedimentos).set({ importador: "hijacked" }).where(eq(pedimentos.id, pedimentoId))
    );
    const check = await withOrg(ORG_A, (tx) =>
      tx.select().from(pedimentos).where(eq(pedimentos.id, pedimentoId))
    );
    crossOrgWriteBlocked = check[0]?.importador !== "hijacked";
  } catch {
    crossOrgWriteBlocked = true;
  }
  if (!crossOrgWriteBlocked) {
    throw new Error("RLS LEAK: org B was able to modify org A's row");
  }

  await withOrg(ORG_A, (tx) => tx.delete(pedimentos).where(eq(pedimentos.id, pedimentoId)));

  console.log("RLS isolation verified: cross-org reads and writes are both blocked.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// One-off: exercises the choferes CRUD path (create/read/update/deactivate,
// per-org isolation) the same way the API routes do, without going through
// HTTP/Clerk auth. Mirrors test-productos-integration.ts.
import { eq } from "drizzle-orm";
import { choferes } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_choferes_test";
const RFC = "XAXX010101000";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(choferes).where(eq(choferes.orgId, ORG));
  });

  // create
  const created = await withOrg(ORG, async (tx) => {
    const [row] = await tx
      .insert(choferes)
      .values({ orgId: ORG, nombre: "Juan Pérez", rfc: RFC, numeroLicencia: "LIC123" })
      .returning();
    return row;
  });
  assert(created.nombre === "Juan Pérez", "created row has expected nombre");
  assert(created.active === true, "new chofer defaults to active");

  // update
  await withOrg(ORG, (tx) => tx.update(choferes).set({ numeroLicencia: "LIC999" }).where(eq(choferes.id, created.id)));
  const updated = await withOrg(ORG, async (tx) => {
    const [row] = await tx.select().from(choferes).where(eq(choferes.id, created.id)).limit(1);
    return row;
  });
  assert(updated.numeroLicencia === "LIC999", "update persisted the new numeroLicencia");

  // deactivate (not a hard delete)
  await withOrg(ORG, (tx) => tx.update(choferes).set({ active: false }).where(eq(choferes.id, created.id)));
  const deactivated = await withOrg(ORG, async (tx) => {
    const [row] = await tx.select().from(choferes).where(eq(choferes.id, created.id)).limit(1);
    return row;
  });
  assert(deactivated.active === false, "deactivate set active=false");
  assert(deactivated.rfc === RFC, "deactivated row still holds its data");

  // per-org isolation: same rfc, different org, must not collide
  const otherOrgRow = await withOrg("org_choferes_test_2", async (tx) => {
    const [row] = await tx
      .insert(choferes)
      .values({ orgId: "org_choferes_test_2", nombre: "Otro", rfc: RFC })
      .returning();
    return row;
  });
  assert(otherOrgRow.rfc === RFC, "a different org can register the same rfc independently");

  // cleanup
  await withOrg(ORG, (tx) => tx.delete(choferes).where(eq(choferes.orgId, ORG)));
  await withOrg("org_choferes_test_2", (tx) => tx.delete(choferes).where(eq(choferes.orgId, "org_choferes_test_2")));

  console.log("Choferes integration test passed: create -> update -> deactivate -> per-org isolation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

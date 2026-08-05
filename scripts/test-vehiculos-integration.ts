// One-off: exercises the vehiculos CRUD path (create/read/update/deactivate,
// per-org isolation) the same way the API routes do, without going through
// HTTP/Clerk auth. Mirrors test-productos-integration.ts.
import { eq } from "drizzle-orm";
import { vehiculos } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_vehiculos_test";
const PLACA = "ABC1234";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(vehiculos).where(eq(vehiculos.orgId, ORG));
  });

  // create
  const created = await withOrg(ORG, async (tx) => {
    const [row] = await tx
      .insert(vehiculos)
      .values({
        orgId: ORG,
        placa: PLACA,
        configVehicular: "C2",
        permisoSct: "TPAF01",
        remolques: [{ subTipoRemolque: "CTR001", placa: "REM001" }],
      })
      .returning();
    return row;
  });
  assert(created.placa === PLACA, "created row has expected placa");
  assert(created.active === true, "new vehiculo defaults to active");
  assert(created.remolques.length === 1, "remolques jsonb round-trips");

  // update
  await withOrg(ORG, (tx) =>
    tx.update(vehiculos).set({ numeroPermiso: "12345" }).where(eq(vehiculos.id, created.id))
  );
  const updated = await withOrg(ORG, async (tx) => {
    const [row] = await tx.select().from(vehiculos).where(eq(vehiculos.id, created.id)).limit(1);
    return row;
  });
  assert(updated.numeroPermiso === "12345", "update persisted the new numeroPermiso");

  // deactivate (not a hard delete)
  await withOrg(ORG, (tx) => tx.update(vehiculos).set({ active: false }).where(eq(vehiculos.id, created.id)));
  const deactivated = await withOrg(ORG, async (tx) => {
    const [row] = await tx.select().from(vehiculos).where(eq(vehiculos.id, created.id)).limit(1);
    return row;
  });
  assert(deactivated.active === false, "deactivate set active=false");
  assert(deactivated.placa === PLACA, "deactivated row still holds its data");

  const activeOnly = await withOrg(ORG, (tx) =>
    tx.select().from(vehiculos).where(eq(vehiculos.orgId, ORG))
  );
  assert(
    activeOnly.filter((r) => r.active).length === 0,
    "no active rows remain after deactivating the only vehiculo"
  );

  // per-org isolation: same placa, different org, must not collide
  const otherOrgRow = await withOrg("org_vehiculos_test_2", async (tx) => {
    const [row] = await tx
      .insert(vehiculos)
      .values({ orgId: "org_vehiculos_test_2", placa: PLACA })
      .returning();
    return row;
  });
  assert(otherOrgRow.placa === PLACA, "a different org can register the same placa independently");

  // cleanup
  await withOrg(ORG, (tx) => tx.delete(vehiculos).where(eq(vehiculos.orgId, ORG)));
  await withOrg("org_vehiculos_test_2", (tx) => tx.delete(vehiculos).where(eq(vehiculos.orgId, "org_vehiculos_test_2")));

  console.log("Vehiculos integration test passed: create -> update -> deactivate -> per-org isolation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

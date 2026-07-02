// One-off: exercises the productos CRUD path (create/read/update/delete,
// dedup-by-fraccion) the same way the API routes do, without going through
// HTTP/Clerk auth.
import { eq } from "drizzle-orm";
import { productos } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_productos_test";
const FRACCION = "76151002";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(productos).where(eq(productos.orgId, ORG));
  });

  // create
  const created = await withOrg(ORG, async (tx) => {
    const [row] = await tx
      .insert(productos)
      .values({
        orgId: ORG,
        fraccion: FRACCION,
        descripcion: "TAPA DE ALUMINIO",
        claveProdServ: "27112806",
        unitKey: "H87",
      })
      .returning();
    return row;
  });
  assert(created.fraccion === FRACCION, "created row has expected fraccion");

  // dedup: same org, same fraccion should conflict at the app layer (route
  // handler checks for existing row before insert; here we just confirm the
  // unique constraint itself holds if that check were skipped)
  let uniqueViolation = false;
  try {
    await withOrg(ORG, (tx) =>
      tx.insert(productos).values({
        orgId: ORG,
        fraccion: FRACCION,
        descripcion: "dup",
        claveProdServ: "00000000",
      })
    );
  } catch {
    uniqueViolation = true;
  }
  assert(uniqueViolation, "unique(org_id, fraccion) constraint rejects a duplicate insert");

  // update
  await withOrg(ORG, (tx) =>
    tx.update(productos).set({ claveProdServ: "27112899" }).where(eq(productos.id, created.id))
  );
  const updated = await withOrg(ORG, async (tx) => {
    const [row] = await tx.select().from(productos).where(eq(productos.id, created.id)).limit(1);
    return row;
  });
  assert(updated.claveProdServ === "27112899", "update persisted the new claveProdServ");

  // per-org isolation: same fraccion, different org, must not collide
  const otherOrgRow = await withOrg("org_productos_test_2", async (tx) => {
    const [row] = await tx
      .insert(productos)
      .values({
        orgId: "org_productos_test_2",
        fraccion: FRACCION,
        descripcion: "different org, same fraccion",
        claveProdServ: "11111111",
      })
      .returning();
    return row;
  });
  assert(otherOrgRow.fraccion === FRACCION, "a different org can map the same fraccion independently");

  // delete
  await withOrg(ORG, (tx) => tx.delete(productos).where(eq(productos.id, created.id)));
  const afterDelete = await withOrg(ORG, (tx) => tx.select().from(productos).where(eq(productos.orgId, ORG)));
  assert(afterDelete.length === 0, "delete removed the row");

  // cleanup the second org's row too
  await withOrg("org_productos_test_2", (tx) =>
    tx.delete(productos).where(eq(productos.id, otherOrgRow.id))
  );

  console.log("Productos integration test passed: create -> dedup -> update -> per-org isolation -> delete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

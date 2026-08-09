// One-off: verifies uploadFacturapiCsd's local guards — no state is written
// when the org isn't provisioned or has no key configured. A real upload
// needs actual SAT-issued .cer/.key files and a live FacturAPI org, which
// aren't available as fixtures here, so that path isn't exercised.
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { uploadFacturapiCsd } from "../src/lib/uploadFacturapiCsd";

const ORG = "org_csd_upload_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name);
}

async function main() {
  await db.delete(organizations).where(eq(organizations.id, ORG));

  // not provisioned -> rejected before ever touching FacturAPI, nothing written
  await db.insert(organizations).values({ id: ORG });
  const notProvisioned = await uploadFacturapiCsd(ORG, fakeFile("a.cer"), fakeFile("a.key"), "pw");
  assert(notProvisioned.csdUploadedAt === null, "upload rejected for an unprovisioned org");
  if (notProvisioned.csdUploadedAt === null) assert(notProvisioned.status === 400, "unprovisioned org returns 400");

  // provisioned but no key on file -> also rejected, nothing written
  await db.update(organizations).set({ facturapiOrgId: "some_facturapi_org_id" }).where(eq(organizations.id, ORG));
  const noKey = await uploadFacturapiCsd(ORG, fakeFile("a.cer"), fakeFile("a.key"), "pw");
  assert(noKey.csdUploadedAt === null, "upload rejected when the org has no FacturAPI key configured");

  const [after] = await db.select().from(organizations).where(eq(organizations.id, ORG)).limit(1);
  assert(!after.csdUploadedAt, "csdUploadedAt stays null across both rejected attempts");

  await db.delete(organizations).where(eq(organizations.id, ORG));
  console.log("CSD upload guards verified: unprovisioned and unkeyed orgs are rejected with no state written.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

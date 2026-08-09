// One-off: verifies provisionFacturapiOrg's local guards (manual-org bypass,
// missing-master-key failure, idempotent already-provisioned success) and,
// when FACTURAPI_USER_KEY is set, the real create-org + fetch-live-key round
// trip against FacturAPI.
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { encryptSecret, decryptSecret } from "../src/lib/crypto";
import { provisionFacturapiOrg } from "../src/lib/provisionFacturapiOrg";

const ORG = "org_provisioning_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await db.delete(organizations).where(eq(organizations.id, ORG));

  // manual-org bypass: never provisioned even if FACTURAPI_USER_KEY is set
  await db.insert(organizations).values({ id: ORG, manualFacturapiKey: true });
  const manualResult = await provisionFacturapiOrg(ORG, "Manual Org");
  assert(!manualResult.activated, "manual-key org is not provisioned");
  if (!manualResult.activated) assert(manualResult.status === 400, "manual-org bypass returns 400");

  // missing master key -> fail soft, no state written
  await db.update(organizations).set({ manualFacturapiKey: false }).where(eq(organizations.id, ORG));
  const savedKey = process.env.FACTURAPI_USER_KEY;
  delete process.env.FACTURAPI_USER_KEY;
  const noKeyResult = await provisionFacturapiOrg(ORG, "Test Org");
  assert(!noKeyResult.activated, "provisioning fails soft when FACTURAPI_USER_KEY is unset");
  const [afterFailure] = await db.select().from(organizations).where(eq(organizations.id, ORG)).limit(1);
  assert(!afterFailure.facturapiOrgId, "no facturapiOrgId written on failure");
  assert(!afterFailure.facturapiKeyEncrypted, "no key written on failure");
  if (savedKey) process.env.FACTURAPI_USER_KEY = savedKey;

  // already-provisioned -> idempotent success, no re-call
  await db
    .update(organizations)
    .set({ facturapiOrgId: "already_provisioned_id", facturapiKeyEncrypted: encryptSecret("sk_live_existing") })
    .where(eq(organizations.id, ORG));
  const idempotentResult = await provisionFacturapiOrg(ORG, "Test Org");
  assert(idempotentResult.activated, "an already-provisioned org reports activated without re-calling FacturAPI");
  const [afterIdempotent] = await db.select().from(organizations).where(eq(organizations.id, ORG)).limit(1);
  assert(afterIdempotent.facturapiOrgId === "already_provisioned_id", "existing facturapiOrgId is untouched");

  if (process.env.FACTURAPI_USER_KEY) {
    await db
      .update(organizations)
      .set({ facturapiOrgId: null, facturapiKeyEncrypted: null })
      .where(eq(organizations.id, ORG));
    const liveResult = await provisionFacturapiOrg(ORG, "Test Org Provisioning");
    assert(liveResult.activated, `real provisioning succeeds: ${!liveResult.activated ? liveResult.error : ""}`);
    const [provisioned] = await db.select().from(organizations).where(eq(organizations.id, ORG)).limit(1);
    assert(!!provisioned.facturapiOrgId, "facturapiOrgId persisted from the real API response");
    assert(!!provisioned.facturapiKeyEncrypted, "live key persisted, encrypted");
    assert(decryptSecret(provisioned.facturapiKeyEncrypted!).startsWith("sk_live_"), "decrypted key looks like a live key");
    console.log(`  provisioned FacturAPI org ${provisioned.facturapiOrgId}`);
  } else {
    console.log("  FACTURAPI_USER_KEY not set — skipping real create-org round trip");
  }

  await db.delete(organizations).where(eq(organizations.id, ORG));
  console.log("Org provisioning verified: manual bypass, fail-soft, and idempotency all hold.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

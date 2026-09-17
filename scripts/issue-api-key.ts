// White-glove API key issuance (#35) for an *existing* org. Superseded for
// the common case: an existing org's own dashboard user can now self-serve
// a key from Configuración (POST /api/settings/api-keys), and onboarding a
// brand-new transportista end to end (org + FacturAPI sub-account + first
// key) is POST /api/v1/admin/organizations (#72). This script still has a
// narrower use this doesn't cover — minting an *additional* key for an
// existing org without dashboard access — so it's kept, not removed.
// The raw key is only ever shown here, once; only its hash is persisted.
//
// Usage: tsx --env-file=.env.local scripts/issue-api-key.ts <org_id> [label]
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { apiKeys, organizations } from "../src/lib/db/schema";

async function main() {
  const [orgId, label] = process.argv.slice(2);
  if (!orgId) {
    console.error("Usage: tsx --env-file=.env.local scripts/issue-api-key.ts <org_id> [label]");
    process.exit(1);
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) {
    console.error(`No organization row for "${orgId}" — create/provision it first.`);
    process.exit(1);
  }

  // Mirrors the org's FacturAPI key mode: "demo" plan issues a test-mode
  // FacturAPI key, everything else issues a live one.
  const mode = org.plan === "demo" ? "test" : "live";
  const rawKey = `pdm_${mode}_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  await db.insert(apiKeys).values({ orgId, keyHash, mode, label: label ?? null });

  console.log(`Issued a ${mode} API key for org "${orgId}".`);
  console.log("This is shown once — store it now:");
  console.log(rawKey);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

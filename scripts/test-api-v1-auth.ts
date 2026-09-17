// One-off verification of requireApiKeyAuth (#35) — proves a valid key
// resolves to its org, and invalid/missing keys both 401 in the standard
// error envelope.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-auth.ts
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, organizations } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey, requireApiKeyAuth } from "../src/lib/v1/auth";

const ORG = "org_api_key_auth_test";
const RAW_KEY = "pdm_test_auth-script-key";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function reqWithAuth(header: string | null) {
  const headers: Record<string, string> = {};
  if (header !== null) headers["Authorization"] = header;
  return new NextRequest("http://localhost/api/v1/catalogs/unidades", { headers });
}

async function cleanup() {
  // requireApiKeyAuth also touches api_rate_limits (#51) — RLS-protected, so
  // deleting it needs org context.
  await withOrg(ORG, (tx) => tx.delete(apiRateLimits).where(eq(apiRateLimits.orgId, ORG)));
  await db.delete(apiKeys).where(eq(apiKeys.orgId, ORG));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

async function main() {
  await cleanup();
  await db.insert(organizations).values({ id: ORG }).onConflictDoNothing();
  await db.insert(apiKeys).values({ orgId: ORG, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  const valid = await requireApiKeyAuth(reqWithAuth(`Bearer ${RAW_KEY}`));
  assert(!(valid instanceof NextResponse), "valid key resolves to auth, not an error response");
  if (!(valid instanceof NextResponse)) {
    assert(valid.orgId === ORG, "valid key resolves to the right org");
    assert(valid.mode === "test", "valid key resolves its mode");
  }

  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.orgId, ORG));
  assert(row.lastUsedAt !== null, "a successful auth stamps last_used_at");

  const wrongKey = await requireApiKeyAuth(reqWithAuth("Bearer not-a-real-key"));
  assert(wrongKey instanceof NextResponse && wrongKey.status === 401, "invalid key 401s");

  const missingHeader = await requireApiKeyAuth(reqWithAuth(null));
  assert(missingHeader instanceof NextResponse && missingHeader.status === 401, "missing header 401s");

  const malformedHeader = await requireApiKeyAuth(reqWithAuth(RAW_KEY)); // no "Bearer " scheme
  assert(malformedHeader instanceof NextResponse && malformedHeader.status === 401, "non-Bearer scheme 401s");

  const errorBody = await (wrongKey as NextResponse).json();
  assert(errorBody.error?.code === "unauthorized", "401s use the standard error envelope");

  await cleanup();
  console.log("API key auth verified: valid key, invalid key, missing header, and malformed header all hold.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// One-off verification of checkRateLimit (#51) — proves the flat per-org
// rate limit 429s once a single org exceeds RATE_LIMIT_PER_WINDOW requests
// within the same window, that a different org has its own independent
// budget, and that requireApiKeyAuth wires it in end to end.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-rate-limit.ts
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, organizations } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey, requireApiKeyAuth } from "../src/lib/v1/auth";
import { checkRateLimit, RATE_LIMIT_PER_WINDOW } from "../src/lib/v1/rateLimit";

const ORG_A = "org_rate_limit_test_a";
const ORG_B = "org_rate_limit_test_b";
const RAW_KEY = "pdm_test_rate-limit-script-key";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function cleanup() {
  for (const org of [ORG_A, ORG_B]) {
    await withOrg(org, (tx) => tx.delete(apiRateLimits).where(eq(apiRateLimits.orgId, org)));
  }
  await db.delete(apiKeys).where(eq(apiKeys.orgId, ORG_A));
  await db.delete(organizations).where(eq(organizations.id, ORG_A));
  await db.delete(organizations).where(eq(organizations.id, ORG_B));
}

async function main() {
  await cleanup();
  await db.insert(organizations).values({ id: ORG_A }).onConflictDoNothing();
  await db.insert(organizations).values({ id: ORG_B }).onConflictDoNothing();
  await db.insert(apiKeys).values({ orgId: ORG_A, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  // Exhaust org A's window directly via checkRateLimit.
  for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) {
    const result = await checkRateLimit(ORG_A);
    assert(result === null, `request ${i + 1}/${RATE_LIMIT_PER_WINDOW} stays under the limit`);
  }
  const exceeded = await checkRateLimit(ORG_A);
  assert(exceeded instanceof NextResponse && exceeded.status === 429, "the request over the limit 429s");
  const exceededBody = await exceeded!.json();
  assert(exceededBody.error?.code === "rate_limit_exceeded", "429 uses the standard error envelope");

  // A different org has its own independent budget, unaffected by A's usage.
  const otherOrg = await checkRateLimit(ORG_B);
  assert(otherOrg === null, "a different org is not rate limited by org A's usage");

  // requireApiKeyAuth wires the limiter in: org A (already exhausted) 429s
  // on the very next authenticated request.
  const req = new NextRequest("http://localhost/api/v1/catalogs/unidades", {
    headers: { Authorization: `Bearer ${RAW_KEY}` },
  });
  const authResult = await requireApiKeyAuth(req);
  assert(authResult instanceof NextResponse && authResult.status === 429, "requireApiKeyAuth 429s once the org's window is exhausted");

  await cleanup();
  console.log(
    `Rate limiting verified: ${RATE_LIMIT_PER_WINDOW} requests pass, the next 429s, a different org is unaffected, and requireApiKeyAuth enforces it.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// One-off verification of withIdempotency (#41) — proves replayed POSTs
// with the same Idempotency-Key + body return the stored response without
// re-running the handler, a same-key/different-body replay is rejected,
// and requests with no Idempotency-Key never dedup.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-idempotency.ts
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { idempotencyKeys, organizations } from "../src/lib/db/schema";
import { withIdempotency } from "../src/lib/v1/idempotency";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_idempotency_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function reqWithKey(key: string | null) {
  const headers: Record<string, string> = {};
  if (key) headers["Idempotency-Key"] = key;
  return new NextRequest("http://localhost/api/v1/test", { headers });
}

async function cleanup() {
  // idempotency_keys is RLS-protected, so deleting it needs org context.
  await withOrg(ORG, (tx) => tx.delete(idempotencyKeys).where(eq(idempotencyKeys.orgId, ORG)));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

async function main() {
  await cleanup();
  await db.insert(organizations).values({ id: ORG }).onConflictDoNothing();

  // First call with a key: handler runs, response is stored.
  let calls = 0;
  const handler = async () => {
    calls++;
    return { status: 201, body: { id: "created-1" } };
  };

  const first = await withIdempotency(reqWithKey("key-a"), ORG, "same-body", handler);
  assert(first.status === 201, "first call returns the handler's status");
  assert(calls === 1, "first call runs the handler once");

  // Replay with the same key + body: handler does NOT run again, same
  // response comes back.
  const replay = await withIdempotency(reqWithKey("key-a"), ORG, "same-body", handler);
  assert(replay.status === 201, "replay returns the stored status");
  assert(calls === 1, "replay does not re-run the handler");
  const replayBody = await replay.json();
  assert(replayBody.id === "created-1", "replay returns the stored body");

  // Same key, different body: rejected, handler does NOT run.
  const conflict = await withIdempotency(reqWithKey("key-a"), ORG, "different-body", handler);
  assert(conflict.status === 422, "same key + different body is rejected");
  assert(calls === 1, "conflicting replay does not run the handler");
  const conflictBody = await conflict.json();
  assert(conflictBody.error.code === "idempotency_key_reused", "conflict uses the standard error envelope");

  // No Idempotency-Key header: no dedup, handler runs every time.
  const noKeyFirst = await withIdempotency(reqWithKey(null), ORG, "irrelevant", handler);
  const noKeySecond = await withIdempotency(reqWithKey(null), ORG, "irrelevant", handler);
  assert(noKeyFirst.status === 201 && noKeySecond.status === 201, "no-key calls still succeed");
  assert(calls === 3, "no-key calls never dedup");

  await cleanup();
  console.log("Idempotency dedup verified: replay, conflict, and no-key behavior all hold.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

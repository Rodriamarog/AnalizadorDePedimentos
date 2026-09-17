import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { withOrg } from "@/lib/db/withOrg";
import { idempotencyKeys } from "@/lib/db/schema";
import { apiError } from "./envelope";

export interface HandlerResult {
  status: number;
  body: unknown;
}

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Idempotency-Key support for /api/v1 write routes (#41). No write
 * endpoint exists yet to wire this into for real — it's exercised directly
 * by scripts/test-api-v1-idempotency.ts and will be reused by
 * facturas create/stamp once those ship.
 *
 * Replaying the same org + key + request body returns the original stored
 * response instead of re-running `handler`. Reusing a key with a
 * *different* body is a client bug, not a replay, so it's rejected rather
 * than silently doing the wrong thing.
 */
export async function withIdempotency(
  req: NextRequest,
  orgId: string,
  rawBody: string,
  handler: () => Promise<HandlerResult>
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    const result = await handler();
    return NextResponse.json(result.body, { status: result.status });
  }

  const requestHash = hashBody(rawBody);

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.orgId, orgId), eq(idempotencyKeys.key, key)));

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return apiError(
          422,
          "idempotency_key_reused",
          "This Idempotency-Key was already used with a different request body",
          [{ field: "Idempotency-Key", issue: "reused_with_different_body" }]
        );
      }
      return NextResponse.json(existing.responseBody, { status: existing.responseStatus });
    }

    const result = await handler();
    await tx.insert(idempotencyKeys).values({
      orgId,
      key,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body as object,
    });
    return NextResponse.json(result.body, { status: result.status });
  });
}

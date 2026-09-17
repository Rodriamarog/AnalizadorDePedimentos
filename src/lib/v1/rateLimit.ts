import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiRateLimits } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { apiError } from "./envelope";

const WINDOW_MS = 60_000;

// Flat rate limit (#39, #51): one limit for every org, regardless of plan
// tier or key mode (test/live) — no gating. Fixed 1-minute window, counted
// per org so a busy org can't exhaust another's budget.
export const RATE_LIMIT_PER_WINDOW = 60;

/**
 * Enforces the flat /api/v1 rate limit for `orgId`. Called from
 * requireApiKeyAuth (#35) so every v1 route gets it for free without each
 * route having to remember to wire it in.
 */
export async function checkRateLimit(orgId: string): Promise<NextResponse | null> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  const count = await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(apiRateLimits)
      .values({ orgId, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [apiRateLimits.orgId, apiRateLimits.windowStart],
        set: { count: sql`${apiRateLimits.count} + 1` },
      })
      .returning({ count: apiRateLimits.count });
    return row.count;
  });

  if (count > RATE_LIMIT_PER_WINDOW) {
    return apiError(429, "rate_limit_exceeded", `Rate limit of ${RATE_LIMIT_PER_WINDOW} requests per minute exceeded`);
  }
  return null;
}

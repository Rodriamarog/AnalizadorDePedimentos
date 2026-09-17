import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { apiError } from "./envelope";
import { checkRateLimit } from "./rateLimit";

export interface ApiKeyAuth {
  orgId: string;
  mode: "test" | "live";
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolves `Authorization: Bearer <key>` to the owning org for /api/v1
 * routes (#35), and enforces the flat per-org rate limit (#51) along the
 * way — every v1 route calls this first, so this is the one place that
 * guarantees the limit applies uniformly across all of them. `api_keys` is
 * deliberately not RLS-protected like the tenant-scoped tables (see
 * schema.ts) — looking a key up is what *establishes* org context, so it
 * can't already be scoped by it.
 */
export async function requireApiKeyAuth(req: NextRequest): Promise<ApiKeyAuth | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return apiError(401, "unauthorized", "Missing or invalid Authorization header");
  }

  const keyHash = hashApiKey(token);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  if (!row) {
    return apiError(401, "unauthorized", "Invalid API key");
  }

  const rateLimited = await checkRateLimit(row.orgId);
  if (rateLimited) return rateLimited;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));

  return { orgId: row.orgId, mode: row.mode as "test" | "live" };
}

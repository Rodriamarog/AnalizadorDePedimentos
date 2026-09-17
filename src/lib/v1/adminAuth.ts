import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "./envelope";

// Gates the platform-admin-only endpoints (#72, onboarding a brand-new
// org) with a single shared secret (PLATFORM_ADMIN_KEY), deliberately
// separate from the tenant `api_keys` table — a tenant's own v1 key must
// never be able to provision other orgs, and there's no per-key role/scope
// concept to lean on for that distinction yet.
export function requirePlatformAdminAuth(req: NextRequest): NextResponse | null {
  const adminKey = process.env.PLATFORM_ADMIN_KEY;
  if (!adminKey) {
    return apiError(503, "not_configured", "Platform admin endpoints are not configured on this deployment");
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return apiError(401, "unauthorized", "Missing or invalid Authorization header");
  }

  const provided = Buffer.from(token);
  const expected = Buffer.from(adminKey);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return apiError(401, "unauthorized", "Invalid platform admin key");
  }

  return null;
}

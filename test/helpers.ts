import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, organizations } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { hashApiKey } from "@/lib/v1/auth";
import { encryptSecret } from "@/lib/crypto";

/**
 * Every test file gets its own org, so the flat 60-req/min rate limit (per
 * org, per minute) never leaks between unrelated test files running in the
 * same window. Tests that specifically exercise the rate limit create their
 * own dedicated org too, so they don't burn budget other tests in the same
 * file need.
 */
export async function createTestOrg(opts: { withFacturapi?: boolean } = {}): Promise<string> {
  const orgId = `org_test_${randomUUID()}`;
  const facturapiKeyEncrypted =
    opts.withFacturapi === false ? null : encryptSecret(requireEnv("FACTURAPI_TEST_API_KEY"));
  await db.insert(organizations).values({ id: orgId, facturapiKeyEncrypted, plan: "demo" });
  return orgId;
}

export async function createApiKey(orgId: string, mode: "test" | "live" = "test"): Promise<string> {
  const token = `sk_${mode}_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKeys).values({ orgId, keyHash: hashApiKey(token), mode });
  return token;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function buildRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): NextRequest {
  const { method = "GET", headers = {}, body } = init;
  const hasJsonBody = body !== undefined;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: hasJsonBody ? { "content-type": "application/json", ...headers } : headers,
    body: hasJsonBody ? JSON.stringify(body) : undefined,
  });
}

const TENANT_TABLES = [
  "partidas",
  "pedimentos",
  "productos",
  "vehiculos",
  "direcciones",
  "choferes",
  "facturas",
  "cliente_emails",
  "complementos_pago",
  "sample_files",
  "idempotency_keys",
  "api_rate_limits",
  "pedimento_jobs",
] as const;

/** Tears down everything a test org touched, in FK-safe order. */
export async function cleanupOrg(orgId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    for (const table of TENANT_TABLES) {
      await tx.execute(sql.raw(`delete from ${table} where org_id = '${orgId}'`));
    }
  });
  await db.delete(apiKeys).where(eq(apiKeys.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — check .env.local`);
  return value;
}

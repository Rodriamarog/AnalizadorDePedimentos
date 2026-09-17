import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requirePlatformAdminAuth } from "@/lib/v1/adminAuth";
import { apiError } from "@/lib/v1/envelope";
import { invalidBodyError } from "@/lib/v1/validation";
import { platformAdminAuth, registry, unauthorizedResponse, invalidParameterResponse, ErrorSchema } from "@/lib/v1/openapi";
import { hashApiKey } from "@/lib/v1/auth";
import { provisionFacturapiOrg } from "@/lib/provisionFacturapiOrg";
import { db } from "@/lib/db/client";
import { apiKeys, organizations } from "@/lib/db/schema";

const provisionOrgSchema = z.object({
  org_name: z.string().meta({ description: "Name for the new FacturAPI sub-account." }),
  org_id: z.string().optional().meta({
    description: "Caller-supplied id for the new org, e.g. for idempotent retries. Auto-generated if omitted.",
  }),
  label: z.string().optional().meta({ description: "Label for the issued API key." }),
});

const provisionOrgResponseSchema = z.object({
  org_id: z.string(),
  mode: z.enum(["test", "live"]),
  api_key: z.string().meta({ description: "Shown once, here — store it immediately." }),
});

registry.registerPath({
  method: "post",
  path: "/admin/organizations",
  summary: "Provision a new org, its FacturAPI sub-account, and an API key",
  description:
    "Platform-admin-only (#72) — replaces the manual scripts/issue-api-key.ts step for onboarding a new " +
    "transportista. Creates an organizations row, provisions a FacturAPI sub-account for it (reusing the " +
    "same logic the Stripe upgrade flow uses), and issues its first API key, returned in plaintext exactly " +
    "once.",
  tags: ["admin"],
  security: [{ [platformAdminAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: provisionOrgSchema } } } },
  responses: {
    201: {
      description: "The provisioned org and its API key.",
      content: { "application/json": { schema: provisionOrgResponseSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
    409: {
      description: "An org with the given org_id already exists.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "FacturAPI provisioning failed.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function POST(req: NextRequest) {
  const authError = requirePlatformAdminAuth(req);
  if (authError) return authError;

  const parsed = provisionOrgSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidBodyError(parsed.error, "org_name is required");
  const body = parsed.data;

  const orgId = body.org_id ?? `org_${randomUUID()}`;

  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (existing) {
    return apiError(409, "duplicate_org", `An organization with id "${orgId}" already exists`, [
      { field: "org_id", issue: "conflict" },
    ]);
  }

  const result = await provisionFacturapiOrg(orgId, body.org_name);
  if (!result.activated) {
    return apiError(result.status, "facturapi_error", result.error);
  }

  const [org] = await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const mode = org?.plan === "live" ? "live" : "test";

  const rawKey = `pdm_${mode}_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKeys).values({ orgId, keyHash: hashApiKey(rawKey), mode, label: body.label ?? null });

  return NextResponse.json({ org_id: orgId, mode, api_key: rawKey }, { status: 201 });
}

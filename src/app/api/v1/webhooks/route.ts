import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiList } from "@/lib/v1/envelope";
import { invalidBodyError } from "@/lib/v1/validation";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { toPublicId } from "@/lib/v1/publicId";
import { webhookSubscriptions } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// Never echoed with `secret` on GET — it's only ever shown once, at
// creation, the same convention API keys use.
const webhookResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  created_at: z.string(),
});

const createWebhookSchema = z.object({
  url: z.url().meta({ description: "HTTPS endpoint events are POSTed to." }),
});

registry.registerPath({
  method: "get",
  path: "/webhooks",
  summary: "List the org's registered webhook subscriptions",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: "The org's webhook subscriptions.",
      content: { "application/json": { schema: z.object({ data: z.array(webhookResponseSchema) }) } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withOrg(auth.orgId, (tx) =>
    tx.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.orgId, auth.orgId))
  );
  return apiList(
    rows.map((r) => ({ id: toPublicId("wh", r.id), url: r.url, created_at: r.createdAt.toISOString() }))
  );
}

registry.registerPath({
  method: "post",
  path: "/webhooks",
  summary: "Register a webhook subscription",
  description:
    "On a successful stamp or cancellation, this app POSTs a signed event payload " +
    '(`{ id, type: "factura.stamped" | "factura.cancelled", created_at, data }`) to `url`, HMAC-SHA256-signed ' +
    "over the raw JSON body with the returned `secret`, sent as `X-Pedimentos-Signature: sha256=<hex>`. " +
    "Verify by recomputing the same HMAC over the raw request body and comparing. Failed deliveries are " +
    "retried twice with backoff (~5s, then ~30s after the initial attempt) before being marked failed.",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createWebhookSchema } } } },
  responses: {
    201: {
      description: "The created webhook subscription, including `secret` (shown only this once).",
      content: {
        "application/json": { schema: webhookResponseSchema.extend({ secret: z.string() }) },
      },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createWebhookSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidBodyError(parsed.error, "url is required");

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [row] = await withOrg(auth.orgId, (tx) =>
    tx.insert(webhookSubscriptions).values({ orgId: auth.orgId, url: parsed.data.url, secret }).returning()
  );

  return NextResponse.json(
    { id: toPublicId("wh", row.id), url: row.url, secret: row.secret, created_at: row.createdAt.toISOString() },
    { status: 201 }
  );
}

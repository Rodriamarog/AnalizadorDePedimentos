import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { withIdempotency } from "@/lib/v1/idempotency";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";
import { scheduleWebhookEvent } from "@/lib/v1/webhookDelivery";

const rawInvoiceSchema = z.record(z.string(), z.unknown());

registry.registerPath({
  method: "post",
  path: "/facturas/{id}/stamp",
  summary: "Stamp a draft factura with the SAT",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The stamped invoice, raw shape returned by the stamping provider.",
      content: { "application/json": { schema: rawInvoiceSchema } },
    },
    ...unauthorizedResponse,
    400: {
      description: "Idempotency-Key header is required.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    422: {
      description: "Idempotency-Key reused with a different request body.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// Stamps a `draft` invoice with the SAT (FacturAPI's `stampDraftInvoice`).
// No body — it timbra whatever FacturAPI already has stored for the draft,
// same contract as the internal stamp route. This is the one v1 write
// operation that hits SAT for real, so Idempotency-Key is required (not
// merely honored-if-present like POST /facturas) — a client retry on a
// dropped response must not risk a second stamp attempt.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return apiError(400, "invalid_parameter", "Idempotency-Key header is required", [
      { field: "Idempotency-Key", issue: "missing" },
    ]);
  }

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  return withIdempotency(req, auth.orgId, id, async () => {
    try {
      const inv = await client.post<{ id: string }>(`invoices/${id}/stamp`);
      await withOrg(auth.orgId, (tx) => saveFactura(tx, auth.orgId, inv, null));
      // Only runs once per actual stamp attempt (not on an idempotent
      // replay, which short-circuits before this handler runs at all).
      scheduleWebhookEvent(auth.orgId, "factura.stamped", inv);
      return { status: 200, body: inv };
    } catch (e) {
      if (e instanceof FacturapiError) {
        return { status: e.status, body: { error: { code: "facturapi_error", message: e.message } } };
      }
      throw e;
    }
  });
}

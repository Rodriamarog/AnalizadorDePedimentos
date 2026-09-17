import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiPage } from "@/lib/v1/envelope";
import { parsePagination } from "@/lib/v1/pagination";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { withIdempotency } from "@/lib/v1/idempotency";
import { resolveCartaPorteReferences } from "@/lib/v1/cartaPorte";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";

// Raw FacturAPI pass-through (#44) — no curated public shape, so the OpenAPI
// schema is intentionally loose (#49's "loose Zod schema" carve-out for
// raw-passthrough resources).
const rawInvoiceSchema = z.record(z.string(), z.unknown());

const CFDI_TYPES = ["I", "E", "N", "P"] as const;

interface FacturapiInvoiceListItem {
  id: string;
  date?: string;
  [key: string]: unknown;
}

registry.registerPath({
  method: "get",
  path: "/facturas",
  summary: "List facturas (I/E/N/P), most recent first",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of facturas.",
      content: { "application/json": { schema: z.object({ data: z.array(rawInvoiceSchema), meta: z.object({ limit: z.number(), offset: z.number(), total: z.number() }) }) } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const pagination = parsePagination(req);
  if (pagination instanceof NextResponse) return pagination;
  const { limit, offset } = pagination;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  try {
    // FacturAPI's `type` filter takes one value per call and paginates by
    // `page`, not `offset` — fetch each type's leading `offset + limit`
    // rows, merge, sort by date desc (matches the internal /api/facturas
    // list), then slice the requested window out of the merged set. Same
    // trade-off the internal route already accepts: exact offset pagination
    // across a merge of 4 independently-paginated upstream lists isn't
    // possible without fetching everything, so this is a best-effort window.
    const fetchLimit = offset + limit;
    const results = await Promise.all(
      CFDI_TYPES.map((type) =>
        client.get<{ data: FacturapiInvoiceListItem[]; total_results?: number }>("invoices", {
          type,
          page: "1",
          limit: fetchLimit,
        })
      )
    );

    const merged = results
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => ((a.date ?? "") === (b.date ?? "") ? 0 : (a.date ?? "") < (b.date ?? "") ? 1 : -1))
      .slice(offset, offset + limit);

    const total = results.reduce((sum, r) => sum + (r.total_results ?? 0), 0);

    return apiPage(merged, { limit, offset, total });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

registry.registerPath({
  method: "post",
  path: "/facturas",
  summary: "Create a factura (I/E/N/P) via raw FacturAPI pass-through",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: { content: { "application/json": { schema: rawInvoiceSchema } } },
  },
  responses: {
    201: {
      description: "The created invoice, raw FacturAPI shape.",
      content: { "application/json": { schema: rawInvoiceSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
    422: {
      description: "Idempotency-Key reused with a different request body.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return apiError(400, "invalid_parameter", "Idempotency-Key header is required", [
      { field: "Idempotency-Key", issue: "missing" },
    ]);
  }

  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return apiError(400, "invalid_parameter", "Request body must be valid JSON");
  }

  const type = typeof body.type === "string" ? body.type : "I";
  if (!(CFDI_TYPES as readonly string[]).includes(type)) {
    return apiError(400, "invalid_parameter", "type must be one of I, E, N, P (T is not yet supported)", [
      { field: "type", issue: "unsupported" },
    ]);
  }

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  const pedimentoId = typeof body.pedimento_id === "string" ? body.pedimento_id : null;
  delete body.pedimento_id;

  return withIdempotency(req, auth.orgId, rawBody, async () => {
    // Resolved inside the handler (not before withIdempotency) so a replay
    // of an already-used Idempotency-Key short-circuits on the stored
    // response without paying for the reference lookups again.
    const cartaPorteError = await resolveCartaPorteReferences(auth.orgId, body);
    if (cartaPorteError) return { status: cartaPorteError.status, body: await cartaPorteError.json() };

    try {
      const inv = await client.post<{ id: string }>("invoices", body);
      await withOrg(auth.orgId, (tx) => saveFactura(tx, auth.orgId, inv, pedimentoId));
      return { status: 201, body: inv };
    } catch (e) {
      if (e instanceof FacturapiError) {
        return { status: e.status, body: { error: { code: "facturapi_error", message: e.message } } };
      }
      throw e;
    }
  });
}

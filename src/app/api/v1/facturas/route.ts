import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiPage } from "@/lib/v1/envelope";
import { parsePagination } from "@/lib/v1/pagination";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { withIdempotency } from "@/lib/v1/idempotency";
import { resolveCartaPorteReferences } from "@/lib/v1/cartaPorte";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { applyStartingFolio } from "@/lib/startingFolio";
import { withOrg } from "@/lib/db/withOrg";
import { facturas } from "@/lib/db/schema";

// Raw FacturAPI pass-through (#44) — no curated public shape, so the OpenAPI
// schema is intentionally loose (#49's "loose Zod schema" carve-out for
// raw-passthrough resources).
const rawInvoiceSchema = z.record(z.string(), z.unknown());

const CFDI_TYPES = ["I", "E", "N", "P", "T"] as const;

// Documents the commonly-used top-level fields for the request body while
// staying a pass-through: a plain z.object() defaults to
// `additionalProperties: true` in the generated schema (any other field
// FacturAPI accepts still goes through untouched), so this is purely a
// docs improvement — POST doesn't validate the body against this schema,
// it forwards whatever JSON it receives straight to FacturAPI.
const createInvoiceRequestSchema = z
  .object({
    type: z
      .enum(CFDI_TYPES)
      .optional()
      .meta({ description: 'CFDI type. Defaults to "I" (Ingreso) when omitted.' }),
    customer: z.string().optional().meta({
      description:
        "Stamping-provider customer id (the unprefixed `id` from POST /clientes' response). Required for every " +
        'type except Traslado ("T"), which carries no customer.',
    }),
    items: z.array(z.record(z.string(), z.unknown())).optional().meta({
      description:
        "CFDI line items (conceptos), each shaped `{ quantity, product: { description, product_key, " +
        'unit_key, price, ... } }`. Required for every type except Traslado ("T"), whose items carry no ' +
        "price/taxes — see the guides' Traslado section.",
    }),
    payment_form: z.string().optional().meta({ description: 'SAT c_FormaPago key, e.g. "03" (transferencia).' }),
    payment_method: z.string().optional().meta({ description: 'SAT c_MetodoPago key: "PUE" or "PPD".' }),
    use: z.string().optional().meta({ description: 'SAT c_UsoCFDI key, e.g. "G03".' }),
    complements: z.array(z.record(z.string(), z.unknown())).optional().meta({
      description:
        'CFDI complements, e.g. a Carta Porte complement (`{ type: "carta_porte", data: {...} }`) — its ' +
        "vehiculo_id/chofer_id/direccion_id references are resolved the same way POST /cartas-porte " +
        "resolves them.",
    }),
    pedimento_id: z.string().optional().meta({
      description:
        "This app's own field, not a stamping-provider one — links the created factura to an uploaded pedimento " +
        "for tracking. Stripped before the request is forwarded to the stamping provider.",
    }),
    external_reference: z.string().optional().meta({
      description:
        "This app's own field, not a stamping-provider one — a caller-supplied trip/operation id, echoed back on " +
        "every response for this resource and filterable via GET /facturas?external_reference=. Independent " +
        "of Idempotency-Key, which only dedups a single request. Stripped before the request is forwarded " +
        "to the stamping provider.",
    }),
  })
  .meta({
    description:
      "Forwarded to the stamping provider's invoice creation endpoint — any field it accepts is allowed, not " +
      "just the ones documented here.",
    example: {
      type: "I",
      customer: "cus_abc123",
      items: [
        {
          quantity: 1,
          product: { description: "Freight service", product_key: "78101803", unit_key: "E48", price: 1500 },
        },
      ],
      payment_form: "03",
      payment_method: "PUE",
      use: "G03",
    },
  });

interface FacturapiInvoiceListItem {
  id: string;
  date?: string;
  [key: string]: unknown;
}

registry.registerPath({
  method: "get",
  path: "/facturas",
  summary: "List facturas (I/E/N/P/T), most recent first",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
      external_reference: z.string().optional().meta({
        description: "Filter to facturas created with this exact external_reference.",
      }),
    }),
  },
  responses: {
    200: {
      description: "A page of facturas, each including this app's own `external_reference`.",
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

  const externalReference = req.nextUrl.searchParams.get("external_reference");

  try {
    // Filtering by external_reference (#68) is our own field, not
    // FacturAPI's — resolved against the local mirror first (which also
    // gives exact offset pagination, unlike the merge-4-lists path below),
    // then hydrated with the raw invoice from FacturAPI per matching row —
    // FacturAPI's list endpoint has no "fetch these specific ids" batch
    // form to hydrate against instead, so this is one GET per row (bounded
    // by `limit`'s 100-row cap, same trade-off as any N+1 against an API
    // with no batch-get).
    if (externalReference !== null) {
      const rows = await withOrg(auth.orgId, (tx) =>
        tx
          .select()
          .from(facturas)
          .where(and(eq(facturas.orgId, auth.orgId), eq(facturas.externalReference, externalReference)))
          .orderBy(desc(facturas.fecha))
          .limit(limit)
          .offset(offset)
      );
      const [{ count: total }] = await withOrg(auth.orgId, (tx) =>
        tx
          .select({ count: count() })
          .from(facturas)
          .where(and(eq(facturas.orgId, auth.orgId), eq(facturas.externalReference, externalReference)))
      );
      const hydrated = await Promise.all(
        rows.map(async (row) => {
          const inv = await client.get<Record<string, unknown>>(`invoices/${row.facturapiId}`);
          return { ...inv, external_reference: row.externalReference };
        })
      );
      return apiPage(hydrated, { limit, offset, total });
    }

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

    const mergedIds = merged.map((item) => item.id);
    const localRows =
      mergedIds.length === 0
        ? []
        : await withOrg(auth.orgId, (tx) =>
            tx
              .select({ facturapiId: facturas.facturapiId, externalReference: facturas.externalReference })
              .from(facturas)
              .where(and(eq(facturas.orgId, auth.orgId), inArray(facturas.facturapiId, mergedIds)))
          );
    const externalReferenceById = new Map(localRows.map((r) => [r.facturapiId, r.externalReference]));
    const mergedWithExternalReference = merged.map((item) => ({
      ...item,
      external_reference: externalReferenceById.get(item.id) ?? null,
    }));

    return apiPage(mergedWithExternalReference, { limit, offset, total });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

registry.registerPath({
  method: "post",
  path: "/facturas",
  summary: "Create a factura (I/E/N/P/T) via raw stamping-provider pass-through",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: { content: { "application/json": { schema: createInvoiceRequestSchema } } },
  },
  responses: {
    201: {
      description: "The created invoice, raw shape from the stamping provider.",
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
    return apiError(400, "invalid_parameter", "type must be one of I, E, N, P, T", [
      { field: "type", issue: "unsupported" },
    ]);
  }

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  const pedimentoId = typeof body.pedimento_id === "string" ? body.pedimento_id : null;
  const externalReference = typeof body.external_reference === "string" ? body.external_reference : null;
  delete body.pedimento_id;
  delete body.external_reference;

  return withIdempotency(req, auth.orgId, rawBody, async () => {
    // Resolved inside the handler (not before withIdempotency) so a replay
    // of an already-used Idempotency-Key short-circuits on the stored
    // response without paying for the reference lookups again.
    const cartaPorteError = await resolveCartaPorteReferences(auth.orgId, body);
    if (cartaPorteError) return { status: cartaPorteError.status, body: await cartaPorteError.json() };

    await applyStartingFolio(auth.orgId, type, body);

    try {
      const inv = await client.post<{ id: string }>("invoices", body);
      await withOrg(auth.orgId, (tx) => saveFactura(tx, auth.orgId, inv, pedimentoId, externalReference));
      return { status: 201, body: { ...inv, external_reference: externalReference } };
    } catch (e) {
      if (e instanceof FacturapiError) {
        return { status: e.status, body: { error: { code: "facturapi_error", message: e.message } } };
      }
      throw e;
    }
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiPage } from "@/lib/v1/envelope";
import { parsePagination } from "@/lib/v1/pagination";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeCliente, clienteResponseSchema, type FacturapiCustomer } from "@/lib/v1/referenceData";
import { clienteEmailsByCustomerIds, replaceClienteEmails } from "@/lib/v1/clienteEmails";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

const createClienteSchema = z.object({
  legal_name: z.string(),
  tax_id: z.string(),
  tax_system: z.string(),
  zip: z.string().optional(),
  email: z.string().optional(),
  emails: z.array(z.string()).optional(),
});

registry.registerPath({
  method: "get",
  path: "/clientes",
  summary: "List the org's clientes (FacturAPI customers, curated shape)",
  tags: ["clientes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ q: z.string().optional(), limit: z.coerce.number().optional(), offset: z.coerce.number().optional() }) },
  responses: {
    200: {
      description: "A page of clientes.",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(clienteResponseSchema),
            meta: z.object({ limit: z.number(), offset: z.number(), total: z.number() }),
          }),
        },
      },
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

  const q = req.nextUrl.searchParams.get("q") ?? "";
  // FacturAPI paginates by `page`, not `offset` — this only lines up exactly
  // when `offset` is a multiple of `limit` (the normal case for a client
  // walking pages one `limit` at a time), same trade-off as /api/v1/facturas.
  const page = Math.floor(offset / limit) + 1;

  try {
    const result = await client.get<{ data: FacturapiCustomer[]; total_results?: number }>("customers", {
      q,
      page,
      limit,
    });
    const rows = result.data ?? [];
    const emailsMap = await clienteEmailsByCustomerIds(auth.orgId, rows.map((r) => r.id));
    const data = rows.map((r) => serializeCliente(r, emailsMap.get(r.id) ?? []));
    return apiPage(data, { limit, offset, total: result.total_results ?? data.length });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

registry.registerPath({
  method: "post",
  path: "/clientes",
  summary: "Create a cliente",
  tags: ["clientes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createClienteSchema } } } },
  responses: {
    201: { description: "The created cliente.", content: { "application/json": { schema: clienteResponseSchema } } },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createClienteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(400, "invalid_parameter", "Invalid cliente payload", [
      { field: "legal_name", issue: "invalid" },
    ]);
  }
  const body = parsed.data;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  try {
    const created = await client.post<FacturapiCustomer>("customers", {
      legal_name: body.legal_name,
      tax_id: body.tax_id,
      tax_system: body.tax_system,
      ...(body.zip ? { address: { zip: body.zip } } : {}),
      ...(body.email ? { email: body.email } : {}),
    });

    const emails = body.emails ?? [];
    if (emails.length > 0) await replaceClienteEmails(auth.orgId, created.id, emails);

    return NextResponse.json(serializeCliente(created, emails), { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

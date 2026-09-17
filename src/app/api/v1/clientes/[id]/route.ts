import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeCliente, clienteResponseSchema, type FacturapiCustomer } from "@/lib/v1/referenceData";
import { getClienteEmails, replaceClienteEmails, deleteClienteEmails } from "@/lib/v1/clienteEmails";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

const updateClienteSchema = z.object({
  legal_name: z.string().optional(),
  tax_id: z.string().optional(),
  tax_system: z.string().optional(),
  zip: z.string().optional(),
  email: z.string().optional(),
  emails: z.array(z.string()).optional(),
});

const notFoundResponse = {
  404: {
    description: "No cliente with that id for this org.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

registry.registerPath({
  method: "get",
  path: "/clientes/{id}",
  summary: "Retrieve a cliente",
  tags: ["clientes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The cliente.", content: { "application/json": { schema: clienteResponseSchema } } },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  try {
    const customer = await client.get<FacturapiCustomer>(`customers/${id}`);
    const emails = await getClienteEmails(auth.orgId, id);
    return NextResponse.json(serializeCliente(customer, emails));
  } catch (e) {
    if (e instanceof FacturapiError) {
      if (e.status === 404) return apiError(404, "not_found", "No cliente with that id");
      return apiError(e.status, "facturapi_error", e.message);
    }
    throw e;
  }
}

registry.registerPath({
  method: "put",
  path: "/clientes/{id}",
  summary: "Update a cliente",
  tags: ["clientes"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateClienteSchema } } },
  },
  responses: {
    200: { description: "The updated cliente.", content: { "application/json": { schema: clienteResponseSchema } } },
    ...notFoundResponse,
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const parsed = updateClienteSchema.safeParse(await req.json());
  if (!parsed.success) return apiError(400, "invalid_parameter", "Invalid cliente payload");
  const body = parsed.data;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  const payload: Record<string, unknown> = {};
  if (body.legal_name !== undefined) payload.legal_name = body.legal_name;
  if (body.tax_id !== undefined) payload.tax_id = body.tax_id;
  if (body.tax_system !== undefined) payload.tax_system = body.tax_system;
  if (body.zip !== undefined) payload.address = { zip: body.zip };
  if (body.email !== undefined) payload.email = body.email;

  try {
    const updated = await client.put<FacturapiCustomer>(`customers/${id}`, payload);
    if (body.emails !== undefined) await replaceClienteEmails(auth.orgId, id, body.emails);
    const emails = await getClienteEmails(auth.orgId, id);
    return NextResponse.json(serializeCliente(updated, emails));
  } catch (e) {
    if (e instanceof FacturapiError) {
      if (e.status === 404) return apiError(404, "not_found", "No cliente with that id");
      return apiError(e.status, "facturapi_error", e.message);
    }
    throw e;
  }
}

registry.registerPath({
  method: "delete",
  path: "/clientes/{id}",
  summary: "Delete a cliente",
  tags: ["clientes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "The cliente was deleted." },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

// Genuine hard delete, delegated to FacturAPI — matches the internal
// /api/clientes/{id} route (#57); there's no local cliente row to
// soft-deactivate, only the extra-emails side table, cleaned up alongside.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  try {
    await client.delete(`customers/${id}`);
  } catch (e) {
    if (e instanceof FacturapiError) {
      if (e.status === 404) return apiError(404, "not_found", "No cliente with that id");
      return apiError(e.status, "facturapi_error", e.message);
    }
    throw e;
  }

  await deleteClienteEmails(auth.orgId, id);

  return new NextResponse(null, { status: 204 });
}

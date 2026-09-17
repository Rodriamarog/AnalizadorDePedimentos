import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { fromPublicId } from "@/lib/v1/publicId";
import { serializeProducto, productoResponseSchema } from "@/lib/v1/referenceData";
import { productos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const updateProductoSchema = z.object({
  descripcion: z.string().optional(),
  clave_prod_serv: z.string().nullable().optional(),
  descripcion_sat: z.string().nullable().optional(),
  unit_key: z.string().optional(),
  confidence: z.string().nullable().optional(),
});

const notFoundResponse = {
  404: {
    description: "No producto with that id for this org.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

registry.registerPath({
  method: "get",
  path: "/productos/{id}",
  summary: "Retrieve a producto",
  tags: ["productos"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The producto.", content: { "application/json": { schema: productoResponseSchema } } },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("prd", publicId);
  if (!id) return apiError(404, "not_found", "No producto with that id");

  const row = await withOrg(auth.orgId, async (tx) => {
    const [r] = await tx.select().from(productos).where(eq(productos.id, id)).limit(1);
    return r ?? null;
  });
  if (!row) return apiError(404, "not_found", "No producto with that id");
  return NextResponse.json(serializeProducto(row));
}

registry.registerPath({
  method: "put",
  path: "/productos/{id}",
  summary: "Update a producto",
  tags: ["productos"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateProductoSchema } } },
  },
  responses: {
    200: { description: "The updated producto.", content: { "application/json": { schema: productoResponseSchema } } },
    ...notFoundResponse,
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("prd", publicId);
  if (!id) return apiError(404, "not_found", "No producto with that id");

  const parsed = updateProductoSchema.safeParse(await req.json());
  if (!parsed.success) return apiError(400, "invalid_parameter", "Invalid producto payload");
  const body = parsed.data;

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(productos).where(eq(productos.id, id)).limit(1);
    if (!existing) return null;

    const [row] = await tx
      .update(productos)
      .set({
        descripcion: body.descripcion ?? existing.descripcion,
        claveProdServ: "clave_prod_serv" in body ? body.clave_prod_serv : existing.claveProdServ,
        descripcionSat: "descripcion_sat" in body ? body.descripcion_sat : existing.descripcionSat,
        unitKey: body.unit_key ?? existing.unitKey,
        confidence: "confidence" in body ? body.confidence : existing.confidence,
      })
      .where(eq(productos.id, existing.id))
      .returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No producto with that id");
  return NextResponse.json(serializeProducto(updated));
}

registry.registerPath({
  method: "delete",
  path: "/productos/{id}",
  summary: "Delete a producto",
  tags: ["productos"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "The producto was deleted." },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

// Genuine hard delete — matches the internal /api/productos/{fraccion}
// route; productos has no `active` column at all (#57).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("prd", publicId);
  if (!id) return apiError(404, "not_found", "No producto with that id");

  const deleted = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(productos).where(eq(productos.id, id)).limit(1);
    if (!existing) return false;
    await tx.delete(productos).where(eq(productos.id, existing.id));
    return true;
  });

  if (!deleted) return apiError(404, "not_found", "No producto with that id");
  return new NextResponse(null, { status: 204 });
}

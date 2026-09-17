import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { fromPublicId } from "@/lib/v1/publicId";
import { serializeDireccion, direccionResponseSchema } from "@/lib/v1/referenceData";
import { direcciones } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// `tipo` is immutable in the public API (#56, enforcing the design intent
// from internal issue #21 that internal code doesn't currently enforce) —
// omitted from the update schema entirely so a caller sending it gets a
// clear 400 instead of the field silently being accepted and ignored.
const updateDireccionSchema = z.object({
  etiqueta: z.string().optional(),
  rfc: z.string().optional(),
  nombre: z.string().nullable().optional(),
  calle: z.string().nullable().optional(),
  numero_exterior: z.string().nullable().optional(),
  numero_interior: z.string().nullable().optional(),
  colonia: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  pais: z.string().nullable().optional(),
  codigo_postal: z.string().nullable().optional(),
});

const notFoundResponse = {
  404: {
    description: "No dirección with that id for this org.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

registry.registerPath({
  method: "get",
  path: "/direcciones/{id}",
  summary: "Retrieve a dirección",
  tags: ["direcciones"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The dirección.", content: { "application/json": { schema: direccionResponseSchema } } },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("dir", publicId);
  if (!id) return apiError(404, "not_found", "No dirección with that id");

  const row = await withOrg(auth.orgId, async (tx) => {
    const [r] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    return r ?? null;
  });
  if (!row) return apiError(404, "not_found", "No dirección with that id");
  return NextResponse.json(serializeDireccion(row));
}

registry.registerPath({
  method: "put",
  path: "/direcciones/{id}",
  summary: "Update a dirección",
  tags: ["direcciones"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateDireccionSchema } } },
  },
  responses: {
    200: {
      description: "The updated dirección.",
      content: { "application/json": { schema: direccionResponseSchema } },
    },
    ...notFoundResponse,
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("dir", publicId);
  if (!id) return apiError(404, "not_found", "No dirección with that id");

  const rawBody = await req.json();
  if (rawBody && typeof rawBody === "object" && "tipo" in rawBody) {
    return apiError(400, "invalid_parameter", "tipo is immutable and cannot be changed via PUT", [
      { field: "tipo", issue: "immutable" },
    ]);
  }

  const parsed = updateDireccionSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "invalid_parameter", "Invalid dirección payload");
  const body = parsed.data;

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!existing) return null;
    const [row] = await tx
      .update(direcciones)
      .set({
        etiqueta: body.etiqueta ?? existing.etiqueta,
        rfc: body.rfc ?? existing.rfc,
        nombre: "nombre" in body ? body.nombre : existing.nombre,
        calle: "calle" in body ? body.calle : existing.calle,
        numeroExterior: "numero_exterior" in body ? body.numero_exterior : existing.numeroExterior,
        numeroInterior: "numero_interior" in body ? body.numero_interior : existing.numeroInterior,
        colonia: "colonia" in body ? body.colonia : existing.colonia,
        municipio: "municipio" in body ? body.municipio : existing.municipio,
        localidad: "localidad" in body ? body.localidad : existing.localidad,
        estado: "estado" in body ? body.estado : existing.estado,
        pais: "pais" in body ? body.pais : existing.pais,
        codigoPostal: "codigo_postal" in body ? body.codigo_postal : existing.codigoPostal,
      })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No dirección with that id");
  return NextResponse.json(serializeDireccion(updated));
}

registry.registerPath({
  method: "delete",
  path: "/direcciones/{id}",
  summary: "Deactivate a dirección (soft-delete)",
  tags: ["direcciones"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The deactivated dirección (active: false).",
      content: { "application/json": { schema: direccionResponseSchema } },
    },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

// Always deactivates, never hard-deletes — the internal route's
// `?permanent=true` hard-delete path is deliberately not exposed here (#56).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("dir", publicId);
  if (!id) return apiError(404, "not_found", "No dirección with that id");

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!existing) return null;
    const [row] = await tx
      .update(direcciones)
      .set({ active: false })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No dirección with that id");
  return NextResponse.json(serializeDireccion(updated));
}

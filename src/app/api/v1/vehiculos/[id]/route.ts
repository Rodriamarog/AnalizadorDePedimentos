import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { fromPublicId } from "@/lib/v1/publicId";
import { serializeVehiculo, vehiculoResponseSchema } from "@/lib/v1/referenceData";
import { vehiculos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const remolqueSchema = z.object({ sub_tipo_remolque: z.string(), placa: z.string() });

const updateVehiculoSchema = z.object({
  placa: z.string().optional(),
  config_vehicular: z.string().nullable().optional(),
  permiso_sct: z.string().nullable().optional(),
  numero_permiso: z.string().nullable().optional(),
  aseguradora_carga: z.string().nullable().optional(),
  poliza_carga: z.string().nullable().optional(),
  aseguradora_resp_civil: z.string().nullable().optional(),
  poliza_resp_civil: z.string().nullable().optional(),
  peso_bruto_vehicular: z.string().nullable().optional(),
  anio_modelo_vehiculo: z.string().nullable().optional(),
  remolques: z.array(remolqueSchema).optional(),
});

const notFoundResponse = {
  404: {
    description: "No vehículo with that id for this org.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

registry.registerPath({
  method: "get",
  path: "/vehiculos/{id}",
  summary: "Retrieve a vehículo",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The vehículo.", content: { "application/json": { schema: vehiculoResponseSchema } } },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("veh", publicId);
  if (!id) return apiError(404, "not_found", "No vehículo with that id");

  const row = await withOrg(auth.orgId, async (tx) => {
    const [r] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    return r ?? null;
  });
  if (!row) return apiError(404, "not_found", "No vehículo with that id");
  return NextResponse.json(serializeVehiculo(row));
}

registry.registerPath({
  method: "put",
  path: "/vehiculos/{id}",
  summary: "Update a vehículo",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateVehiculoSchema } } },
  },
  responses: {
    200: {
      description: "The updated vehículo.",
      content: { "application/json": { schema: vehiculoResponseSchema } },
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
  const id = fromPublicId("veh", publicId);
  if (!id) return apiError(404, "not_found", "No vehículo with that id");

  const parsed = updateVehiculoSchema.safeParse(await req.json());
  if (!parsed.success) return apiError(400, "invalid_parameter", "Invalid vehículo payload");
  const body = parsed.data;

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    if (!existing) return null;

    const [row] = await tx
      .update(vehiculos)
      .set({
        placa: body.placa ?? existing.placa,
        configVehicular: "config_vehicular" in body ? body.config_vehicular : existing.configVehicular,
        permisoSct: "permiso_sct" in body ? body.permiso_sct : existing.permisoSct,
        numeroPermiso: "numero_permiso" in body ? body.numero_permiso : existing.numeroPermiso,
        aseguradoraCarga: "aseguradora_carga" in body ? body.aseguradora_carga : existing.aseguradoraCarga,
        polizaCarga: "poliza_carga" in body ? body.poliza_carga : existing.polizaCarga,
        aseguradoraRespCivil:
          "aseguradora_resp_civil" in body ? body.aseguradora_resp_civil : existing.aseguradoraRespCivil,
        polizaRespCivil: "poliza_resp_civil" in body ? body.poliza_resp_civil : existing.polizaRespCivil,
        pesoBrutoVehicular:
          "peso_bruto_vehicular" in body ? body.peso_bruto_vehicular : existing.pesoBrutoVehicular,
        anioModeloVehiculo:
          "anio_modelo_vehiculo" in body ? body.anio_modelo_vehiculo : existing.anioModeloVehiculo,
        remolques: body.remolques
          ? body.remolques.map((r) => ({ subTipoRemolque: r.sub_tipo_remolque, placa: r.placa }))
          : existing.remolques,
      })
      .where(eq(vehiculos.id, existing.id))
      .returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No vehículo with that id");
  return NextResponse.json(serializeVehiculo(updated));
}

registry.registerPath({
  method: "delete",
  path: "/vehiculos/{id}",
  summary: "Deactivate a vehículo (soft-delete)",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The deactivated vehículo (active: false).",
      content: { "application/json": { schema: vehiculoResponseSchema } },
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
  const id = fromPublicId("veh", publicId);
  if (!id) return apiError(404, "not_found", "No vehículo with that id");

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    if (!existing) return null;
    const [row] = await tx.update(vehiculos).set({ active: false }).where(eq(vehiculos.id, existing.id)).returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No vehículo with that id");
  return NextResponse.json(serializeVehiculo(updated));
}

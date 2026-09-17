import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeVehiculo, vehiculoResponseSchema } from "@/lib/v1/referenceData";
import { vehiculos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const remolqueSchema = z.object({ sub_tipo_remolque: z.string(), placa: z.string() });

const createVehiculoSchema = z.object({
  placa: z.string(),
  config_vehicular: z.string().optional(),
  permiso_sct: z.string().optional(),
  numero_permiso: z.string().optional(),
  aseguradora_carga: z.string().optional(),
  poliza_carga: z.string().optional(),
  aseguradora_resp_civil: z.string().optional(),
  poliza_resp_civil: z.string().optional(),
  peso_bruto_vehicular: z.string().optional(),
  anio_modelo_vehiculo: z.string().optional(),
  remolques: z.array(remolqueSchema).optional(),
});

registry.registerPath({
  method: "get",
  path: "/vehiculos",
  summary: "List the org's vehículos (fleet, for Carta Porte)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ active: z.enum(["true", "false"]).optional() }) },
  responses: {
    200: {
      description: "The org's vehículos.",
      content: { "application/json": { schema: z.object({ data: z.array(vehiculoResponseSchema) }) } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const activeParam = req.nextUrl.searchParams.get("active");
  const conditions = [eq(vehiculos.orgId, auth.orgId)];
  if (activeParam === "true") conditions.push(eq(vehiculos.active, true));
  if (activeParam === "false") conditions.push(eq(vehiculos.active, false));

  const rows = await withOrg(auth.orgId, (tx) => tx.select().from(vehiculos).where(and(...conditions)));
  return apiList(rows.map(serializeVehiculo));
}

registry.registerPath({
  method: "post",
  path: "/vehiculos",
  summary: "Create a vehículo",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createVehiculoSchema } } } },
  responses: {
    201: {
      description: "The created vehículo.",
      content: { "application/json": { schema: vehiculoResponseSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createVehiculoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(400, "invalid_parameter", "Invalid vehículo payload", [{ field: "placa", issue: "missing" }]);
  }
  const body = parsed.data;

  const created = await withOrg(auth.orgId, async (tx) => {
    const [row] = await tx
      .insert(vehiculos)
      .values({
        orgId: auth.orgId,
        placa: body.placa,
        configVehicular: body.config_vehicular ?? null,
        permisoSct: body.permiso_sct ?? null,
        numeroPermiso: body.numero_permiso ?? null,
        aseguradoraCarga: body.aseguradora_carga ?? null,
        polizaCarga: body.poliza_carga ?? null,
        aseguradoraRespCivil: body.aseguradora_resp_civil ?? null,
        polizaRespCivil: body.poliza_resp_civil ?? null,
        pesoBrutoVehicular: body.peso_bruto_vehicular ?? null,
        anioModeloVehiculo: body.anio_modelo_vehiculo ?? null,
        remolques: (body.remolques ?? []).map((r) => ({ subTipoRemolque: r.sub_tipo_remolque, placa: r.placa })),
      })
      .returning();
    return row;
  });

  return NextResponse.json(serializeVehiculo(created), { status: 201 });
}

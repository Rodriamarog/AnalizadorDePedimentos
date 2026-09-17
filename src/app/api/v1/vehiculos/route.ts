import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeVehiculo, vehiculoResponseSchema } from "@/lib/v1/referenceData";
import { vehiculos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { createVehiculoRecord, createVehiculoSchema } from "@/lib/v1/createReference";

registry.registerPath({
  method: "get",
  path: "/vehiculos",
  summary: "List the org's vehículos (fleet, for Carta Porte)",
  tags: ["vehiculos"],
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
  tags: ["vehiculos"],
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

  const created = await createVehiculoRecord(auth.orgId, body);

  return NextResponse.json(serializeVehiculo(created), { status: 201 });
}

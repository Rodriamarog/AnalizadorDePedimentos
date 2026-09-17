import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeDireccion, direccionResponseSchema } from "@/lib/v1/referenceData";
import { direcciones } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const createDireccionSchema = z.object({
  tipo: z.enum(["origen", "destino"]),
  etiqueta: z.string(),
  rfc: z.string(),
  nombre: z.string().optional(),
  calle: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  colonia: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  codigo_postal: z.string().optional(),
});

registry.registerPath({
  method: "get",
  path: "/direcciones",
  summary: "List the org's direcciones (Origen/Destino addresses, for Carta Porte)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      active: z.enum(["true", "false"]).optional(),
      tipo: z.enum(["origen", "destino"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "The org's direcciones.",
      content: { "application/json": { schema: z.object({ data: z.array(direccionResponseSchema) }) } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const activeParam = req.nextUrl.searchParams.get("active");
  const tipo = req.nextUrl.searchParams.get("tipo");
  const conditions = [eq(direcciones.orgId, auth.orgId)];
  if (activeParam === "true") conditions.push(eq(direcciones.active, true));
  if (activeParam === "false") conditions.push(eq(direcciones.active, false));
  if (tipo === "origen" || tipo === "destino") conditions.push(eq(direcciones.tipo, tipo));

  const rows = await withOrg(auth.orgId, (tx) => tx.select().from(direcciones).where(and(...conditions)));
  return apiList(rows.map(serializeDireccion));
}

registry.registerPath({
  method: "post",
  path: "/direcciones",
  summary: "Create a dirección",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createDireccionSchema } } } },
  responses: {
    201: {
      description: "The created dirección.",
      content: { "application/json": { schema: direccionResponseSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createDireccionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(400, "invalid_parameter", "tipo, etiqueta y rfc son requeridos", [{ issue: "invalid" }]);
  }
  const body = parsed.data;

  const created = await withOrg(auth.orgId, async (tx) => {
    const [row] = await tx
      .insert(direcciones)
      .values({
        orgId: auth.orgId,
        tipo: body.tipo,
        etiqueta: body.etiqueta,
        rfc: body.rfc,
        nombre: body.nombre ?? null,
        calle: body.calle ?? null,
        numeroExterior: body.numero_exterior ?? null,
        numeroInterior: body.numero_interior ?? null,
        colonia: body.colonia ?? null,
        municipio: body.municipio ?? null,
        localidad: body.localidad ?? null,
        estado: body.estado ?? null,
        pais: body.pais ?? null,
        codigoPostal: body.codigo_postal ?? null,
      })
      .returning();
    return row;
  });

  return NextResponse.json(serializeDireccion(created), { status: 201 });
}

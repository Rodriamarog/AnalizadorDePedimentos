import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeProducto, productoResponseSchema } from "@/lib/v1/referenceData";
import { productos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const createProductoSchema = z.object({
  fraccion: z.string(),
  descripcion: z.string(),
  clave_prod_serv: z.string().optional(),
  descripcion_sat: z.string().optional(),
  unit_key: z.string().optional(),
  confidence: z.string().optional(),
});

registry.registerPath({
  method: "get",
  path: "/productos",
  summary: "List the org's productos (fracción → ClaveProdServ mappings)",
  tags: ["productos"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ fraccion: z.string().optional() }) },
  responses: {
    200: {
      description: "The org's productos.",
      content: { "application/json": { schema: z.object({ data: z.array(productoResponseSchema) }) } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const fraccion = req.nextUrl.searchParams.get("fraccion");
  const conditions = [eq(productos.orgId, auth.orgId)];
  if (fraccion) conditions.push(eq(productos.fraccion, fraccion));

  const rows = await withOrg(auth.orgId, (tx) => tx.select().from(productos).where(and(...conditions)));
  return apiList(rows.map(serializeProducto));
}

registry.registerPath({
  method: "post",
  path: "/productos",
  summary: "Create a producto",
  tags: ["productos"],
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createProductoSchema } } } },
  responses: {
    201: { description: "The created producto.", content: { "application/json": { schema: productoResponseSchema } } },
    409: {
      description: "A producto with that fracción already exists for this org.",
      content: { "application/json": { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createProductoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(400, "invalid_parameter", "fraccion y descripcion son requeridos", [{ issue: "invalid" }]);
  }
  const body = parsed.data;

  return withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(productos)
      .where(and(eq(productos.orgId, auth.orgId), eq(productos.fraccion, body.fraccion)))
      .limit(1);
    if (existing) {
      return apiError(409, "already_exists", "Ya existe un producto con esa fracción", [
        { field: "fraccion", issue: "duplicate" },
      ]);
    }

    const [created] = await tx
      .insert(productos)
      .values({
        orgId: auth.orgId,
        fraccion: body.fraccion,
        descripcion: body.descripcion,
        claveProdServ: body.clave_prod_serv ?? null,
        descripcionSat: body.descripcion_sat ?? null,
        unitKey: body.unit_key ?? "H87",
        confidence: body.confidence ?? null,
      })
      .returning();
    return NextResponse.json(serializeProducto(created), { status: 201 });
  });
}

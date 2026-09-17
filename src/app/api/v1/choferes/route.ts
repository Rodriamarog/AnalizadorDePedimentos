import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError, apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { serializeChofer, choferResponseSchema } from "@/lib/v1/referenceData";
import { choferes } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const createChoferSchema = z.object({
  nombre: z.string(),
  rfc: z.string(),
  numero_licencia: z.string().optional(),
});

registry.registerPath({
  method: "get",
  path: "/choferes",
  summary: "List the org's choferes (drivers, for Carta Porte)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ active: z.enum(["true", "false"]).optional() }) },
  responses: {
    200: {
      description: "The org's choferes.",
      content: { "application/json": { schema: z.object({ data: z.array(choferResponseSchema) }) } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const activeParam = req.nextUrl.searchParams.get("active");
  const conditions = [eq(choferes.orgId, auth.orgId)];
  if (activeParam === "true") conditions.push(eq(choferes.active, true));
  if (activeParam === "false") conditions.push(eq(choferes.active, false));

  const rows = await withOrg(auth.orgId, (tx) => tx.select().from(choferes).where(and(...conditions)));
  return apiList(rows.map(serializeChofer));
}

registry.registerPath({
  method: "post",
  path: "/choferes",
  summary: "Create a chofer",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createChoferSchema } } } },
  responses: {
    201: { description: "The created chofer.", content: { "application/json": { schema: choferResponseSchema } } },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createChoferSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(400, "invalid_parameter", "nombre y rfc son requeridos", [{ issue: "invalid" }]);
  }
  const body = parsed.data;

  const created = await withOrg(auth.orgId, async (tx) => {
    const [row] = await tx
      .insert(choferes)
      .values({
        orgId: auth.orgId,
        nombre: body.nombre,
        rfc: body.rfc,
        numeroLicencia: body.numero_licencia ?? null,
      })
      .returning();
    return row;
  });

  return NextResponse.json(serializeChofer(created), { status: 201 });
}

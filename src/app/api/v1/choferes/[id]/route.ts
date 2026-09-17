import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { fromPublicId } from "@/lib/v1/publicId";
import { serializeChofer, choferResponseSchema } from "@/lib/v1/referenceData";
import { choferes } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const updateChoferSchema = z.object({
  nombre: z.string().optional(),
  rfc: z.string().optional(),
  numero_licencia: z.string().nullable().optional(),
});

const notFoundResponse = {
  404: {
    description: "No chofer with that id for this org.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

registry.registerPath({
  method: "get",
  path: "/choferes/{id}",
  summary: "Retrieve a chofer",
  tags: ["choferes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The chofer.", content: { "application/json": { schema: choferResponseSchema } } },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("chf", publicId);
  if (!id) return apiError(404, "not_found", "No chofer with that id");

  const row = await withOrg(auth.orgId, async (tx) => {
    const [r] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    return r ?? null;
  });
  if (!row) return apiError(404, "not_found", "No chofer with that id");
  return NextResponse.json(serializeChofer(row));
}

registry.registerPath({
  method: "put",
  path: "/choferes/{id}",
  summary: "Update a chofer",
  tags: ["choferes"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateChoferSchema } } },
  },
  responses: {
    200: { description: "The updated chofer.", content: { "application/json": { schema: choferResponseSchema } } },
    ...notFoundResponse,
    ...invalidParameterResponse,
    ...unauthorizedResponse,
  },
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("chf", publicId);
  if (!id) return apiError(404, "not_found", "No chofer with that id");

  const parsed = updateChoferSchema.safeParse(await req.json());
  if (!parsed.success) return apiError(400, "invalid_parameter", "Invalid chofer payload");
  const body = parsed.data;

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    if (!existing) return null;
    const [row] = await tx
      .update(choferes)
      .set({
        nombre: body.nombre ?? existing.nombre,
        rfc: body.rfc ?? existing.rfc,
        numeroLicencia: "numero_licencia" in body ? body.numero_licencia : existing.numeroLicencia,
      })
      .where(eq(choferes.id, existing.id))
      .returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No chofer with that id");
  return NextResponse.json(serializeChofer(updated));
}

registry.registerPath({
  method: "delete",
  path: "/choferes/{id}",
  summary: "Deactivate a chofer (soft-delete)",
  tags: ["choferes"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The deactivated chofer (active: false).",
      content: { "application/json": { schema: choferResponseSchema } },
    },
    ...notFoundResponse,
    ...unauthorizedResponse,
  },
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("chf", publicId);
  if (!id) return apiError(404, "not_found", "No chofer with that id");

  const updated = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    if (!existing) return null;
    const [row] = await tx.update(choferes).set({ active: false }).where(eq(choferes.id, existing.id)).returning();
    return row;
  });

  if (!updated) return apiError(404, "not_found", "No chofer with that id");
  return NextResponse.json(serializeChofer(updated));
}

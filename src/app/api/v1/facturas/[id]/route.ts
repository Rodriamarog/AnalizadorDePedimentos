import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { facturas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const rawInvoiceSchema = z.record(z.string(), z.unknown());

registry.registerPath({
  method: "get",
  path: "/facturas/{id}",
  summary: "Retrieve a factura by its FacturAPI invoice id",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The full raw FacturAPI invoice object, plus this app's own `external_reference` (#68).",
      content: { "application/json": { schema: rawInvoiceSchema } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  try {
    const inv = await client.get<Record<string, unknown>>(`invoices/${id}`);
    const externalReference = await withOrg(auth.orgId, async (tx) => {
      const [local] = await tx
        .select({ externalReference: facturas.externalReference })
        .from(facturas)
        .where(eq(facturas.facturapiId, id))
        .limit(1);
      return local?.externalReference ?? null;
    });
    return NextResponse.json({ ...inv, external_reference: externalReference });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

registry.registerPath({
  method: "delete",
  path: "/facturas/{id}",
  summary: "Cancel a factura",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({
      motive: z.string().optional().meta({ description: "SAT cancellation motive code, defaults to 02." }),
      substitution: z.string().optional().meta({ description: "Replacement invoice UUID, required for motive 01." }),
    }),
  },
  responses: {
    200: {
      description: "The cancelled invoice, raw FacturAPI shape, plus this app's own `external_reference` (#68).",
      content: { "application/json": { schema: rawInvoiceSchema } },
    },
    ...unauthorizedResponse,
  },
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const { searchParams } = req.nextUrl;

  try {
    const inv = await client.delete<{ id: string; status?: string; cancellation_status?: string }>(
      `invoices/${id}`,
      {
        motive: searchParams.get("motive") ?? "02",
        substitution: searchParams.get("substitution") ?? undefined,
      }
    );
    // Matches the internal route: only update the local mirror if it already
    // exists, never create one on cancel.
    const externalReference = await withOrg(auth.orgId, async (tx) => {
      const [existing] = await tx.select().from(facturas).where(eq(facturas.facturapiId, id)).limit(1);
      if (!existing) return null;
      await tx
        .update(facturas)
        .set({
          status: inv.status ?? "canceled",
          cancellationStatus: inv.cancellation_status || "canceled",
        })
        .where(eq(facturas.id, existing.id));
      return existing.externalReference;
    });
    return NextResponse.json({ ...inv, external_reference: externalReference });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

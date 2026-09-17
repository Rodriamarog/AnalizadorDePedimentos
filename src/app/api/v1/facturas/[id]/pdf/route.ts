import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

registry.registerPath({
  method: "get",
  path: "/facturas/{id}/pdf",
  summary: "Download a stamped factura's PDF",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The invoice PDF.",
      content: { "application/pdf": { schema: z.string().meta({ format: "binary" }) } },
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
    const res = await client.raw("GET", `invoices/${id}/pdf`);
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${id}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof FacturapiError) return apiError(e.status, "facturapi_error", e.message);
    throw e;
  }
}

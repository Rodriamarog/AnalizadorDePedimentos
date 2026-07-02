import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
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
    if (e instanceof FacturapiError) {
      return NextResponse.json({ error: "No se pudo descargar el PDF" }, { status: e.status });
    }
    throw e;
  }
}

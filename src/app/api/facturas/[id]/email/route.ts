import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const data = await client.post(`invoices/${id}/email`, body);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof FacturapiError) {
      return NextResponse.json({ error: e.message || "No se pudo enviar el correo" }, { status: e.status });
    }
    throw e;
  }
}

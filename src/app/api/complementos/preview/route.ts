import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { buildComplementForInvoice } from "@/lib/buildComplemento";

// Shares buildComplementForInvoice with the real POST /api/complementos
// route so the previewed PDF reflects the exact same balance/installment/tax
// breakdown that would actually be timbrado — never persisted, never posted
// to FacturAPI as a real invoice.
export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const body = await req.json();
  const facturaFacturapiId: string = body.factura_facturapi_id;
  const formaPago: string = body.forma_pago;
  const monto = Number(body.monto);
  const fechaPagoStr: string = body.fecha_pago; // YYYY-MM-DD

  try {
    const result = await buildComplementForInvoice(client, {
      facturaFacturapiId,
      formaPago,
      monto,
      fechaPagoStr,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const res = await client.raw("POST", "invoices/preview/pdf", { json: result.complementBody });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, { headers: { "Content-Type": "application/pdf" } });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

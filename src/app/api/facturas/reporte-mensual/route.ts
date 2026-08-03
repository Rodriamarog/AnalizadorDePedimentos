import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { buildMonthlyReportData } from "@/lib/facturaReporteMensual";
import { renderMonthlyReportPdf } from "@/lib/facturaReportePdf";

export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const { searchParams } = req.nextUrl;
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Parámetros year/month inválidos" }, { status: 400 });
  }

  try {
    const org = await client.get<{ legal?: { legal_name?: string; name?: string } }>("organizations/me");
    const orgName = org.legal?.legal_name ?? org.legal?.name ?? "";

    const data = await buildMonthlyReportData(client, { year, month, orgName });
    const buf = await renderMonthlyReportPdf(data);

    return new NextResponse(buf as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-facturas-${year}-${String(month).padStart(2, "0")}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof FacturapiError) {
      return NextResponse.json({ error: e.message }, { status: e.status || 502 });
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("reporte-mensual failed", { orgId, year, month, error: e });
    return NextResponse.json({ error: `No se pudo generar el reporte: ${message}` }, { status: 500 });
  }
}

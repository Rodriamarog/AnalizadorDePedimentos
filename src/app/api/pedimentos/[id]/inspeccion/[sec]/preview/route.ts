import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { withOrg } from "@/lib/db/withOrg";
import { buildInspeccionDocxFor, loadPedimentoConNom } from "@/lib/inspeccionData";

// Renders a partida's Solicitud de Inspección as HTML (via mammoth) for
// inline preview in the picker modal — browsers can't render .docx directly
// the way they can a PDF, so this is the equivalent of the PDF/XML iframe
// preview used elsewhere in the app (see facturas/page.tsx).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sec: string }> }
) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id, sec } = await params;

  const data = await withOrg(orgId, (tx) => loadPedimentoConNom(tx, id));
  if (!data) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }
  const partida = data.partidas.find((p) => p.sec === Number(sec));
  if (!partida) {
    return NextResponse.json({ error: "Partida no encontrada o sin requisito NOM" }, { status: 404 });
  }

  const buf = await buildInspeccionDocxFor(data.pedimento, partida);
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  return NextResponse.json({ html });
}

import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { withOrg } from "@/lib/db/withOrg";
import { buildInspeccionDocxFor, inspeccionFilename, loadPedimentoConNom } from "@/lib/inspeccionData";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; sec: string }> }
) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id, sec } = await params;
  const facturaOverride = new URL(req.url).searchParams.get("factura");

  const data = await withOrg(orgId, (tx) => loadPedimentoConNom(tx, id));
  if (!data) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }
  const partida = data.partidas.find((p) => p.sec === Number(sec));
  if (!partida) {
    return NextResponse.json({ error: "Partida no encontrada o sin requisito NOM" }, { status: 404 });
  }

  const buf = await buildInspeccionDocxFor(data.pedimento, partida, facturaOverride);
  return new NextResponse(buf as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${inspeccionFilename(partida)}"`,
    },
  });
}

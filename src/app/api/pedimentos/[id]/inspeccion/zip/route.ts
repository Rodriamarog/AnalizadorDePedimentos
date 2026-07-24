import JSZip from "jszip";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { withOrg } from "@/lib/db/withOrg";
import { buildInspeccionDocxFor, inspeccionFilename, loadPedimentoConNom } from "@/lib/inspeccionData";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const facturaOverride = new URL(req.url).searchParams.get("factura");

  const data = await withOrg(orgId, (tx) => loadPedimentoConNom(tx, id));
  if (!data) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }
  if (data.partidas.length === 0) {
    return NextResponse.json(
      { error: "Ninguna partida de este pedimento requiere inspección NOM" },
      { status: 400 }
    );
  }

  const zip = new JSZip();
  for (const partida of data.partidas) {
    zip.file(inspeccionFilename(partida), await buildInspeccionDocxFor(data.pedimento, partida, facturaOverride));
  }
  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

  const baseFilename = `pedimento_${data.pedimento.pedimentoNum.replace(/\s+/g, "_")}`;
  return new NextResponse(zipBuf as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseFilename}_inspecciones.zip"`,
    },
  });
}

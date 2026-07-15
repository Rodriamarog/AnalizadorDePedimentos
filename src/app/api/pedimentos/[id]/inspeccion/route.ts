import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { withOrg } from "@/lib/db/withOrg";
import { inspeccionFilename, loadPedimentoConNom } from "@/lib/inspeccionData";

// Lists the partidas of this pedimento that carry a NOM clave (e.g.
// NOM-050-SCFI-2004) — a partida with none (like a plain lid with no
// labeling requirement) doesn't get a "Solicitud de Servicios de Inspección".
// The actual docx files are generated lazily, one at a time, by the [sec]
// sub-route (either for its own download or its /preview), and in bulk by
// the /zip sub-route — this route only returns metadata for the picker modal.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const data = await withOrg(orgId, (tx) => loadPedimentoConNom(tx, id));
  if (!data) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    partidas: data.partidas.map((p) => ({
      sec: p.sec,
      descripcion: p.descripcion,
      nomClave: p.nomClave,
      filename: inspeccionFilename(p),
    })),
  });
}

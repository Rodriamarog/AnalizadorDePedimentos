import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { parseAndPersistPedimento, PedimentoUploadError } from "@/lib/pedimentoUpload";

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  try {
    const { pedimento, partidas, duplicate, parsedPartidas } = await parseAndPersistPedimento(orgId, file);
    if (duplicate) {
      return NextResponse.json({
        id: pedimento.id,
        _duplicate: true,
        pedimentoNum: pedimento.pedimentoNum,
        importador: pedimento.importador,
        tipoCambio: pedimento.tipoCambio,
        dta: pedimento.dta,
        igi: pedimento.igi,
        prv: pedimento.prv,
        pesoBruto: pedimento.pesoBruto,
        partidas,
      });
    }
    return NextResponse.json({ ...pedimento, partidas: parsedPartidas });
  } catch (e) {
    if (e instanceof PedimentoUploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("Error al guardar el pedimento en la base de datos:", e);
    return NextResponse.json(
      { error: `Error al guardar el pedimento: ${e instanceof Error ? e.message : e}` },
      { status: 500 }
    );
  }
}

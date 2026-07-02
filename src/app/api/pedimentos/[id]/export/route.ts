import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { buildExportWorkbook } from "@/lib/exportXlsx";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const data = await withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
    if (!pedimento) return null;
    const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, id));
    return { pedimento, partidas: rows };
  });

  if (!data) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }

  const wb = await buildExportWorkbook(data.pedimento, data.partidas);
  const buf = await wb.xlsx.writeBuffer();
  const filename = `pedimento_${data.pedimento.pedimentoNum.replace(/\s+/g, "_")}.xlsx`;

  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({
        id: pedimentos.id,
        pedimentoNum: pedimentos.pedimentoNum,
        importador: pedimentos.importador,
        tipoCambio: pedimentos.tipoCambio,
        pdfFilename: pedimentos.pdfFilename,
        fechaUpload: pedimentos.fechaUpload,
        numPartidas: sql<number>`count(${partidas.id})`.mapWith(Number),
      })
      .from(pedimentos)
      .leftJoin(partidas, eq(partidas.pedimentoId, pedimentos.id))
      .where(eq(pedimentos.orgId, orgId))
      .groupBy(pedimentos.id)
      .orderBy(desc(pedimentos.fechaUpload))
  );

  return NextResponse.json(rows);
}

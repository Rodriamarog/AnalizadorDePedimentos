import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
    if (!pedimento) {
      return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
    }
    const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, id));
    return NextResponse.json({ ...pedimento, partidas: rows });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
    if (!pedimento) {
      return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
    }
    await tx.delete(partidas).where(eq(partidas.pedimentoId, id));
    await tx.delete(pedimentos).where(eq(pedimentos.id, id));
    return NextResponse.json({ ok: true });
  });
}

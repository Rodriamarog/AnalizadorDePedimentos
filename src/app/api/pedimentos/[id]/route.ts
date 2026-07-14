import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { pedimentos, partidas, facturas } from "@/lib/db/schema";
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

// Bulk-sets a per-partida T.C. override, for pedimentos covered by multiple
// invoices paid on different dates. Body: { partidaIds: string[], tipoCambio: number }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const body = await req.json();
  const partidaIds: string[] = Array.isArray(body.partidaIds)
    ? body.partidaIds.filter((v: unknown) => typeof v === "string")
    : [];
  const tipoCambio = Number(body.tipoCambio);

  if (partidaIds.length === 0 || !tipoCambio || tipoCambio <= 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(partidas)
      .set({ tipoCambio })
      .where(and(eq(partidas.pedimentoId, id), inArray(partidas.id, partidaIds)))
      .returning();
    return NextResponse.json(rows);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  try {
    return await withOrg(orgId, async (tx) => {
      const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
      if (!pedimento) {
        return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
      }

      // facturas.pedimento_id has no ON DELETE cascade — a pedimento with an
      // issued invoice must not be deletable out from under it, so check
      // first and return a clear message instead of letting the FK
      // violation bubble up as an opaque 500.
      const linkedFacturas = await tx
        .select({ id: facturas.id })
        .from(facturas)
        .where(eq(facturas.pedimentoId, id));
      if (linkedFacturas.length > 0) {
        return NextResponse.json(
          {
            error: `No se puede eliminar: tiene ${linkedFacturas.length} factura${linkedFacturas.length > 1 ? "s" : ""} vinculada${linkedFacturas.length > 1 ? "s" : ""}.`,
          },
          { status: 409 }
        );
      }

      await tx.delete(partidas).where(eq(partidas.pedimentoId, id));
      await tx.delete(pedimentos).where(eq(pedimentos.id, id));
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al eliminar el pedimento" },
      { status: 500 }
    );
  }
}

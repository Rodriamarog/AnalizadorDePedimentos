import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { choferes } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [c] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    if (!c) return NextResponse.json({ error: "Chofer no encontrado" }, { status: 404 });
    return NextResponse.json(c);
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const body = await req.json();

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Chofer no encontrado" }, { status: 404 });

    const [updated] = await tx
      .update(choferes)
      .set({
        nombre: body.nombre ?? existing.nombre,
        rfc: body.rfc ?? existing.rfc,
        numeroLicencia: "numero_licencia" in body ? body.numero_licencia : existing.numeroLicencia,
      })
      .where(eq(choferes.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

// Deactivates rather than deletes: historical Carta Porte invoices keep
// referencing this chofer even after they've left.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Chofer no encontrado" }, { status: 404 });
    const [updated] = await tx
      .update(choferes)
      .set({ active: false })
      .where(eq(choferes.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

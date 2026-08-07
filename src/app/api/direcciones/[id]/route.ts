import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { direcciones } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [d] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!d) return NextResponse.json({ error: "Dirección no encontrada" }, { status: 404 });
    return NextResponse.json(d);
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const body = await req.json();

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Dirección no encontrada" }, { status: 404 });

    const [updated] = await tx
      .update(direcciones)
      .set({
        etiqueta: body.etiqueta ?? existing.etiqueta,
        rfc: body.rfc ?? existing.rfc,
        nombre: "nombre" in body ? body.nombre : existing.nombre,
        calle: "calle" in body ? body.calle : existing.calle,
        numeroExterior: "numero_exterior" in body ? body.numero_exterior : existing.numeroExterior,
        numeroInterior: "numero_interior" in body ? body.numero_interior : existing.numeroInterior,
        colonia: "colonia" in body ? body.colonia : existing.colonia,
        municipio: "municipio" in body ? body.municipio : existing.municipio,
        localidad: "localidad" in body ? body.localidad : existing.localidad,
        estado: "estado" in body ? body.estado : existing.estado,
        pais: "pais" in body ? body.pais : existing.pais,
        codigoPostal: "codigo_postal" in body ? body.codigo_postal : existing.codigoPostal,
      })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

// Deactivates rather than deletes: historical Carta Porte invoices keep
// referencing this dirección even after it's retired.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Dirección no encontrada" }, { status: 404 });
    const [updated] = await tx
      .update(direcciones)
      .set({ active: false })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

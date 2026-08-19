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

    if ("tipo" in body && body.tipo !== "origen" && body.tipo !== "destino") {
      return NextResponse.json({ error: "tipo debe ser 'origen' o 'destino'" }, { status: 400 });
    }

    const [updated] = await tx
      .update(direcciones)
      .set({
        tipo: body.tipo ?? existing.tipo,
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
        googlePlaceId: "google_place_id" in body ? body.google_place_id : existing.googlePlaceId,
      })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

// Deactivates by default: a dirección used on a past Carta Porte has its
// address fields copied by value into that invoice (no FK back to this
// table), but keeping the row around lets the org still see it in this list
// for reference. `?permanent=true` (only meant to be sent for a row that's
// already inactive — see the page's two-step UI) does a real delete instead,
// for cleaning up entries that were never actually used.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const permanent = req.nextUrl.searchParams.get("permanent") === "true";

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Dirección no encontrada" }, { status: 404 });

    if (permanent) {
      await tx.delete(direcciones).where(eq(direcciones.id, existing.id));
      return NextResponse.json({ id: existing.id });
    }

    const [updated] = await tx
      .update(direcciones)
      .set({ active: false })
      .where(eq(direcciones.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

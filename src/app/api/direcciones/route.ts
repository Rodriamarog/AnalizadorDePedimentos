import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { direcciones } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// GET ?active=true restricts to active rows only (for pickers elsewhere in
// the app); omitted, the management page gets everything so retired
// direcciones stay visible for reference.
export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const onlyActive = req.nextUrl.searchParams.get("active") === "true";

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(direcciones)
      .where(
        onlyActive ? and(eq(direcciones.orgId, orgId), eq(direcciones.active, true)) : eq(direcciones.orgId, orgId)
      )
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json();
  if (!body.etiqueta) {
    return NextResponse.json({ error: "etiqueta es requerida" }, { status: 400 });
  }
  if (!body.rfc) {
    return NextResponse.json({ error: "rfc es requerido" }, { status: 400 });
  }

  return withOrg(orgId, async (tx) => {
    const [created] = await tx
      .insert(direcciones)
      .values({
        orgId,
        etiqueta: body.etiqueta,
        rfc: body.rfc,
        nombre: body.nombre ?? null,
        calle: body.calle ?? null,
        numeroExterior: body.numero_exterior ?? null,
        numeroInterior: body.numero_interior ?? null,
        colonia: body.colonia ?? null,
        municipio: body.municipio ?? null,
        localidad: body.localidad ?? null,
        estado: body.estado ?? null,
        pais: body.pais ?? null,
        codigoPostal: body.codigo_postal ?? null,
        googlePlaceId: body.google_place_id ?? null,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  });
}

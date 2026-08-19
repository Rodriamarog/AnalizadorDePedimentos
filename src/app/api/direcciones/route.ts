import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { direcciones } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// GET ?active=true restricts to active rows only (for pickers elsewhere in
// the app); omitted, the management page gets everything so retired
// direcciones stay visible for reference. ?tipo=origen|destino restricts to
// that classification (issue #21); omitted returns both.
export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const onlyActive = req.nextUrl.searchParams.get("active") === "true";
  const tipo = req.nextUrl.searchParams.get("tipo");

  const conditions = [eq(direcciones.orgId, orgId)];
  if (onlyActive) conditions.push(eq(direcciones.active, true));
  if (tipo === "origen" || tipo === "destino") conditions.push(eq(direcciones.tipo, tipo));

  const rows = await withOrg(orgId, (tx) => tx.select().from(direcciones).where(and(...conditions)));
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
  if (body.tipo !== "origen" && body.tipo !== "destino") {
    return NextResponse.json({ error: "tipo debe ser 'origen' o 'destino'" }, { status: 400 });
  }

  return withOrg(orgId, async (tx) => {
    const [created] = await tx
      .insert(direcciones)
      .values({
        orgId,
        tipo: body.tipo,
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

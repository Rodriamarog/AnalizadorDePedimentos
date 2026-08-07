import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { vehiculos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// GET ?active=true restricts to active rows only (for pickers elsewhere in
// the app); omitted, the management page gets everything so retired
// vehículos stay visible for reference.
export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const onlyActive = req.nextUrl.searchParams.get("active") === "true";

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(vehiculos)
      .where(onlyActive ? and(eq(vehiculos.orgId, orgId), eq(vehiculos.active, true)) : eq(vehiculos.orgId, orgId))
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json();
  if (!body.placa) {
    return NextResponse.json({ error: "placa es requerida" }, { status: 400 });
  }

  return withOrg(orgId, async (tx) => {
    const [created] = await tx
      .insert(vehiculos)
      .values({
        orgId,
        placa: body.placa,
        configVehicular: body.config_vehicular ?? null,
        permisoSct: body.permiso_sct ?? null,
        numeroPermiso: body.numero_permiso ?? null,
        aseguradoraCarga: body.aseguradora_carga ?? null,
        polizaCarga: body.poliza_carga ?? null,
        aseguradoraRespCivil: body.aseguradora_resp_civil ?? null,
        polizaRespCivil: body.poliza_resp_civil ?? null,
        pesoBrutoVehicular: body.peso_bruto_vehicular ?? null,
        anioModeloVehiculo: body.anio_modelo_vehiculo ?? null,
        remolques: body.remolques ?? [],
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  });
}

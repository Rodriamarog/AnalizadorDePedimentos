import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { vehiculos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [v] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    if (!v) return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    return NextResponse.json(v);
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const body = await req.json();

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });

    const [updated] = await tx
      .update(vehiculos)
      .set({
        placa: body.placa ?? existing.placa,
        configVehicular: "config_vehicular" in body ? body.config_vehicular : existing.configVehicular,
        permisoSct: "permiso_sct" in body ? body.permiso_sct : existing.permisoSct,
        numeroPermiso: "numero_permiso" in body ? body.numero_permiso : existing.numeroPermiso,
        aseguradora: "aseguradora" in body ? body.aseguradora : existing.aseguradora,
        poliza: "poliza" in body ? body.poliza : existing.poliza,
        remolques: body.remolques ?? existing.remolques,
      })
      .where(eq(vehiculos.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

// Deactivates rather than deletes: historical Carta Porte invoices keep
// referencing this vehículo even after it's retired from the active fleet.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    const [updated] = await tx
      .update(vehiculos)
      .set({ active: false })
      .where(eq(vehiculos.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

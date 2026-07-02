import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { productos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(_req: Request, { params }: { params: Promise<{ fraccion: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { fraccion } = await params;

  return withOrg(orgId, async (tx) => {
    const [p] = await tx.select().from(productos).where(eq(productos.fraccion, fraccion)).limit(1);
    if (!p) return NextResponse.json({ error: "Fracción no encontrada" }, { status: 404 });
    return NextResponse.json(p);
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ fraccion: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { fraccion } = await params;
  const body = await req.json();

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(productos).where(eq(productos.fraccion, fraccion)).limit(1);
    if (!existing) return NextResponse.json({ error: "Fracción no encontrada" }, { status: 404 });

    const [updated] = await tx
      .update(productos)
      .set({
        descripcion: body.descripcion ?? existing.descripcion,
        claveProdServ: body.clave_prod_serv ?? existing.claveProdServ,
        descripcionSat: "descripcion_sat" in body ? body.descripcion_sat : existing.descripcionSat,
        unitKey: body.unit_key ?? existing.unitKey,
        confidence: "confidence" in body ? body.confidence : existing.confidence,
      })
      .where(eq(productos.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ fraccion: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { fraccion } = await params;

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx.select().from(productos).where(eq(productos.fraccion, fraccion)).limit(1);
    if (!existing) return NextResponse.json({ error: "Fracción no encontrada" }, { status: 404 });
    await tx.delete(productos).where(eq(productos.id, existing.id));
    return new NextResponse(null, { status: 204 });
  });
}

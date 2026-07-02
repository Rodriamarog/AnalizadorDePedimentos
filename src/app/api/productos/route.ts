import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { productos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const rows = await withOrg(orgId, (tx) => tx.select().from(productos).where(eq(productos.orgId, orgId)));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json();
  if (!body.fraccion || !body.descripcion || !body.clave_prod_serv) {
    return NextResponse.json(
      { error: "fraccion, descripcion y clave_prod_serv son requeridos" },
      { status: 400 }
    );
  }

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(productos)
      .where(eq(productos.fraccion, body.fraccion))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: "Ya existe un producto con esa fracción" }, { status: 409 });
    }

    const [created] = await tx
      .insert(productos)
      .values({
        orgId,
        fraccion: body.fraccion,
        descripcion: body.descripcion,
        claveProdServ: body.clave_prod_serv,
        descripcionSat: body.descripcion_sat ?? null,
        unitKey: body.unit_key ?? "H87",
        confidence: body.confidence ?? null,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  });
}

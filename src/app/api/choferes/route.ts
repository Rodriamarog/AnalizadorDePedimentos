import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { choferes } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// GET ?active=true restricts to active rows only (for pickers elsewhere in
// the app); omitted, the management page gets everything so retired
// choferes stay visible for reference.
export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const onlyActive = req.nextUrl.searchParams.get("active") === "true";

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(choferes)
      .where(onlyActive ? and(eq(choferes.orgId, orgId), eq(choferes.active, true)) : eq(choferes.orgId, orgId))
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json();
  if (!body.nombre || !body.rfc) {
    return NextResponse.json({ error: "nombre y rfc son requeridos" }, { status: 400 });
  }

  return withOrg(orgId, async (tx) => {
    const [created] = await tx
      .insert(choferes)
      .values({
        orgId,
        nombre: body.nombre,
        rfc: body.rfc,
        numeroLicencia: body.numero_licencia ?? null,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  });
}

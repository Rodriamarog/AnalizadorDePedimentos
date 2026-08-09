import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { provisionFacturapiOrg } from "@/lib/provisionFacturapiOrg";

export async function POST() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  let orgName: string;
  try {
    const clerk = await clerkClient();
    const clerkOrg = await clerk.organizations.getOrganization({ organizationId: orgId });
    orgName = clerkOrg.name;
  } catch {
    return NextResponse.json(
      { error: "No se pudo obtener el nombre de la organización" },
      { status: 502 }
    );
  }

  const result = await provisionFacturapiOrg(orgId, orgName);
  if (!result.activated) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ activated: true });
}

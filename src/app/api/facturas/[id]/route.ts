import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { facturas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const { searchParams } = req.nextUrl;

  try {
    const inv = await client.delete<{ id: string; status?: string; cancellation_status?: string }>(
      `invoices/${id}`,
      {
        motive: searchParams.get("motive") ?? "02",
        substitution: searchParams.get("substitution") ?? undefined,
      }
    );
    // Matches the old app: only update the local mirror if it already
    // exists, never create one on cancel.
    await withOrg(orgId, async (tx) => {
      const [existing] = await tx.select().from(facturas).where(eq(facturas.facturapiId, id)).limit(1);
      if (existing) {
        await tx
          .update(facturas)
          .set({
            status: inv.status ?? "canceled",
            cancellationStatus: inv.cancellation_status || "canceled",
          })
          .where(eq(facturas.id, existing.id));
      }
    });
    return NextResponse.json(inv);
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

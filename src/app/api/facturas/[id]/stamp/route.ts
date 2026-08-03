import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";

// Stamps a `draft` invoice with the SAT (FacturAPI's `stampDraftInvoice`).
// Any pending edits must be saved via PUT /api/facturas/[id] first — this
// endpoint takes no body, it only timbra whatever FacturAPI already has
// stored for the draft.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  try {
    const inv = await client.post<{ id: string }>(`invoices/${id}/stamp`);
    await withOrg(orgId, (tx) => saveFactura(tx, orgId, inv, null));
    return NextResponse.json(inv);
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

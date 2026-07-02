import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";

export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const { searchParams } = req.nextUrl;
  try {
    const data = await client.get("invoices", {
      type: "I",
      q: searchParams.get("q") ?? undefined,
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "50",
      payment_method: searchParams.get("payment_method") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const body = await req.json();
  const pedimentoId: string | null = body.pedimento_id ?? null;
  delete body.pedimento_id;

  try {
    const inv = await client.post<{ id: string }>("invoices", body);
    await withOrg(orgId, (tx) => saveFactura(tx, orgId, inv, pedimentoId));
    return NextResponse.json(inv, { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

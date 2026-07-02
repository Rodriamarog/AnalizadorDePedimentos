import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  try {
    return NextResponse.json(await client.get(`customers/${id}`));
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const body = await req.json();

  try {
    return NextResponse.json(await client.put(`customers/${id}`, body));
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  try {
    await client.delete(`customers/${id}`);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

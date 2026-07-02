import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";

export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const { searchParams } = req.nextUrl;
  try {
    const data = await client.get("customers", {
      q: searchParams.get("q") ?? "",
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
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
  try {
    const data = await client.post("customers", body);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

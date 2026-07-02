import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { searchSatClaves } from "@/lib/satSearch";

export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const data = await searchSatClaves(q);
  return NextResponse.json({ data });
}

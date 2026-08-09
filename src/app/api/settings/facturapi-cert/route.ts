import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { uploadFacturapiCsd } from "@/lib/uploadFacturapiCsd";

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const form = await req.formData();
  const cer = form.get("cer");
  const key = form.get("key");
  const password = form.get("password");
  if (!(cer instanceof File) || !(key instanceof File) || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "cer, key y password son requeridos" }, { status: 400 });
  }

  const result = await uploadFacturapiCsd(orgId, cer, key, password);
  if (result.csdUploadedAt === null) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ csdUploadedAt: result.csdUploadedAt });
}

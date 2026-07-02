import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return NextResponse.json({ configured: !!org?.facturapiKeyEncrypted });
}

export async function PUT(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const { apiKey } = await req.json();
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "apiKey es requerido" }, { status: 400 });
  }

  const encrypted = encryptSecret(apiKey);
  await db
    .insert(organizations)
    .values({ id: orgId, facturapiKeyEncrypted: encrypted })
    .onConflictDoUpdate({ target: organizations.id, set: { facturapiKeyEncrypted: encrypted } });

  return NextResponse.json({ configured: true });
}

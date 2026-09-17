import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { apiKeys, organizations } from "@/lib/db/schema";
import { hashApiKey } from "@/lib/v1/auth";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const rows = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      mode: apiKeys.mode,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt));

  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;

  // Same rule the white-glove issuance script uses: a "demo" plan org runs
  // on FacturAPI's test key, so its v1 keys are labeled "test" to match —
  // this is just the displayed mode, the org's actual FacturAPI key (not
  // this table) is what really decides which FacturAPI environment a
  // request hits.
  const [org] = await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const mode = org?.plan === "demo" ? "test" : "live";

  const rawKey = `pdm_${mode}_${randomBytes(24).toString("hex")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ orgId, keyHash: hashApiKey(rawKey), mode, label })
    .returning({ id: apiKeys.id, label: apiKeys.label, mode: apiKeys.mode, createdAt: apiKeys.createdAt });

  // The raw key is only ever returned here, once — only its hash is stored.
  return NextResponse.json({ ...row, key: rawKey }, { status: 201 });
}

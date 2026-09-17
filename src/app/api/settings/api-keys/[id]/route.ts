import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)))
    .returning({ id: apiKeys.id });

  if (!deleted) return NextResponse.json({ error: "Llave no encontrada" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

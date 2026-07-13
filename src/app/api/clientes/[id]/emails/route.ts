import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { clienteEmails } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// Extra send-to emails for a cliente, stored locally since FacturAPI's
// Customer object only has a single `email` field. Keyed by the FacturAPI
// customer id, not a local cliente row (there isn't one — customers live
// entirely in FacturAPI).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({ email: clienteEmails.email })
      .from(clienteEmails)
      .where(and(eq(clienteEmails.orgId, orgId), eq(clienteEmails.customerId, id)))
  );
  return NextResponse.json({ emails: rows.map((r) => r.email) });
}

// Replaces the full extra-emails set for this cliente (delete + reinsert in
// one transaction), rather than diffing — the form always submits the
// complete list, so this keeps the route trivial.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;
  const body = await req.json();
  const emails: string[] = Array.isArray(body.emails)
    ? Array.from(new Set(body.emails.map((e: string) => e.trim()).filter(Boolean)))
    : [];

  await withOrg(orgId, async (tx) => {
    await tx
      .delete(clienteEmails)
      .where(and(eq(clienteEmails.orgId, orgId), eq(clienteEmails.customerId, id)));
    if (emails.length > 0) {
      await tx.insert(clienteEmails).values(emails.map((email) => ({ orgId, customerId: id, email })));
    }
  });

  return NextResponse.json({ emails });
}

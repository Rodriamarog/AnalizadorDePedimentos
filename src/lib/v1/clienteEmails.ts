import { and, eq } from "drizzle-orm";
import { clienteEmails } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// Extra send-to emails for a cliente (#57) — stored locally keyed by the raw
// FacturAPI customer id (there's no local cliente row to hang them off of),
// shared between the /clientes list, single-resource GET, and PUT routes so
// the (orgId, customerId)-scoped query shape lives in one place.

export async function getClienteEmails(orgId: string, customerId: string): Promise<string[]> {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({ email: clienteEmails.email })
      .from(clienteEmails)
      .where(and(eq(clienteEmails.orgId, orgId), eq(clienteEmails.customerId, customerId)))
  );
  return rows.map((r) => r.email);
}

export async function replaceClienteEmails(orgId: string, customerId: string, emails: string[]): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx.delete(clienteEmails).where(and(eq(clienteEmails.orgId, orgId), eq(clienteEmails.customerId, customerId)));
    if (emails.length > 0) {
      await tx.insert(clienteEmails).values(emails.map((email) => ({ orgId, customerId, email })));
    }
  });
}

// Batch form for list endpoints — one query for a page of customers instead
// of one round-trip per row.
export async function clienteEmailsByCustomerIds(orgId: string, customerIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (customerIds.length === 0) return map;

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({ customerId: clienteEmails.customerId, email: clienteEmails.email })
      .from(clienteEmails)
      .where(eq(clienteEmails.orgId, orgId))
  );
  for (const r of rows) {
    if (!customerIds.includes(r.customerId)) continue;
    map.set(r.customerId, [...(map.get(r.customerId) ?? []), r.email]);
  }
  return map;
}

export async function deleteClienteEmails(orgId: string, customerId: string): Promise<void> {
  await withOrg(orgId, (tx) =>
    tx.delete(clienteEmails).where(and(eq(clienteEmails.orgId, orgId), eq(clienteEmails.customerId, customerId)))
  );
}

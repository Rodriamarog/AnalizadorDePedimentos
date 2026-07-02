import { eq } from "drizzle-orm";
import { facturas } from "./db/schema";
import type { OrgTx } from "./db/withOrg";

export interface FacturapiInvoice {
  id: string;
  uuid?: string;
  status?: string;
  cancellation_status?: string | null;
  payment_method?: string;
  total?: number;
  currency?: string;
  customer?: { legal_name?: string; tax_id?: string } & Record<string, unknown>;
  series?: string;
  folio_number?: number;
  date?: string;
  created_at?: string;
}

// Upserts a FacturAPI invoice object into the local `facturas` table —
// ported from the old app's `_save_factura`. Must run inside a `withOrg`
// transaction; takes the transaction handle rather than opening its own.
export async function saveFactura(tx: OrgTx, orgId: string, inv: FacturapiInvoice, pedimentoId: string | null) {
  const [existing] = await tx.select().from(facturas).where(eq(facturas.facturapiId, inv.id)).limit(1);

  if (existing) {
    const [updated] = await tx
      .update(facturas)
      .set({
        status: inv.status ?? existing.status,
        cancellationStatus: inv.cancellation_status || "none",
        uuid: inv.uuid ?? existing.uuid,
      })
      .where(eq(facturas.id, existing.id))
      .returning();
    return updated;
  }

  const dateStr = inv.date ?? inv.created_at ?? new Date().toISOString();
  const [created] = await tx
    .insert(facturas)
    .values({
      orgId,
      facturapiId: inv.id,
      uuid: inv.uuid ?? null,
      pedimentoId,
      status: inv.status ?? "valid",
      cancellationStatus: inv.cancellation_status || "none",
      paymentMethod: inv.payment_method ?? "PUE",
      total: inv.total ?? 0,
      currency: inv.currency ?? "MXN",
      customerName: inv.customer?.legal_name ?? "",
      customerTaxId: inv.customer?.tax_id ?? "",
      serie: inv.series ?? null,
      folioNumber: inv.folio_number ?? null,
      fecha: new Date(dateStr),
    })
    .returning();
  return created;
}

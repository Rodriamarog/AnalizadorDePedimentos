import type { FacturapiClient } from "./facturapi";

// FacturAPI rate-limits with 429s under bursty concurrency — confirmed live
// that even 8 concurrent requests can draw one — and firing dozens of
// requests in one Promise.all (one per invoice/customer) was also observed
// to trigger network-level ETIMEDOUT failures for orgs with a few dozen
// invoices in a month. Cap how many run at once; the client's own
// retry-with-backoff (facturapi.ts) absorbs any 429s that still occur.
const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface FacturapiTax {
  type: "IVA" | "ISR" | "IEPS";
  rate: number;
  base?: number;
  withholding?: boolean;
}

interface FacturapiLineItem {
  quantity: number;
  discount?: number;
  product: {
    price: number;
    taxes?: FacturapiTax[];
  };
}

interface FacturapiInvoice {
  id: string;
  uuid?: string;
  folio_number?: number;
  series?: string;
  date: string;
  status: "valid" | "canceled" | "pending" | "draft";
  type: "I" | "P" | "E" | "N" | "T";
  currency: string;
  total: number;
  total_payment_amount?: number;
  customer?: { id?: string; legal_name?: string; tax_id?: string };
  items?: FacturapiLineItem[];
}

interface FacturapiCustomer {
  id: string;
  address?: {
    street?: string;
    exterior?: string;
    interior?: string;
    neighborhood?: string;
    city?: string;
    municipality?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface ReporteInvoiceRow {
  folio: string;
  uuid: string;
  fecha: string;
  rfc: string;
  receptor: string;
  domicilio: string;
  estado: string;
  esComplemento: boolean;
  subtotal: number;
  trasladado: number;
  retenido: number;
  total: number;
}

export interface ReporteCurrencyGroup {
  currency: string;
  rows: ReporteInvoiceRow[];
  subtotalGenerado: number;
  totalRetenido: number;
  totalTrasladado: number;
  totalGenerado: number;
  firstFolio: number | null;
  lastFolio: number | null;
}

export interface MonthlyReportData {
  orgName: string;
  year: number;
  month: number;
  groups: ReporteCurrencyGroup[];
}

function formatDomicilio(c: FacturapiCustomer | undefined): string {
  if (!c?.address) return "";
  const { street, exterior, interior, neighborhood, municipality, city, state, zip, country } = c.address;
  const linea1 = [street, exterior && `No. ${exterior}`, interior && `Int. ${interior}`].filter(Boolean).join(" ");
  const linea2 = [neighborhood && `col. ${neighborhood}`, municipality || city, state, country, zip && `C.P. ${zip}`]
    .filter(Boolean)
    .join(" ");
  return [linea1, linea2].filter(Boolean).join(", ");
}

function itemTaxTotals(item: FacturapiLineItem): { subtotal: number; trasladado: number; retenido: number } {
  const taxes = item.product.taxes ?? [];
  const fallbackSubtotal = item.quantity * item.product.price - (item.discount ?? 0);
  const subtotal = taxes[0]?.base ?? fallbackSubtotal;
  let trasladado = 0;
  let retenido = 0;
  for (const tax of taxes) {
    const amount = (tax.base ?? subtotal) * tax.rate;
    if (tax.withholding) retenido += amount;
    else trasladado += amount;
  }
  return { subtotal, trasladado, retenido };
}

function invoiceTotals(inv: FacturapiInvoice): { subtotal: number; trasladado: number; retenido: number } {
  if (inv.status === "canceled") return { subtotal: 0, trasladado: 0, retenido: 0 };
  let subtotal = 0;
  let trasladado = 0;
  let retenido = 0;
  for (const item of inv.items ?? []) {
    const t = itemTaxTotals(item);
    subtotal += t.subtotal;
    trasladado += t.trasladado;
    retenido += t.retenido;
  }
  return { subtotal, trasladado, retenido };
}

const ESTADO_LABEL: Record<string, string> = {
  valid: "Vigente",
  canceled: "cfdiCancelado",
  pending: "Pendiente",
  draft: "Borrador",
};

export async function buildMonthlyReportData(
  client: FacturapiClient,
  { year, month, orgName }: { year: number; month: number; orgName: string }
): Promise<MonthlyReportData> {
  const gte = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const lt = new Date(Date.UTC(year, month, 1)).toISOString();

  // Type "I" (facturas de ingreso) carry the real merchandise/tax breakdown;
  // type "P" (complementos de pago) are fetched too so the report shows
  // which payment complements were stamped in the period, alongside the
  // facturas they settle.
  const invoices: FacturapiInvoice[] = [];
  for (const type of ["I", "P"] as const) {
    for (let page = 1; page <= 30; page++) {
      const res = await client.get<{ data: FacturapiInvoice[] }>("invoices", {
        type,
        "date[gte]": gte,
        "date[lt]": lt,
        page,
        limit: 100,
      });
      invoices.push(...res.data);
      if (res.data.length < 100) break;
    }
  }

  // The list endpoint caps `items[]` at 20 entries per invoice even when the
  // real invoice has more (confirmed against the live sandbox: a 57-item
  // invoice showed only 20 here), which silently undercounts subtotal/tax
  // totals for invoices with many partidas. Fetch full detail per invoice
  // (skipping cancelled ones and complementos de pago, whose items are just
  // a placeholder "Pago" concept with no tax to recompute) to get the real
  // items array.
  await mapWithConcurrency(
    invoices.filter((inv) => inv.status !== "canceled" && inv.type === "I"),
    CONCURRENCY,
    async (inv) => {
      const full = await client.get<{ items?: FacturapiLineItem[] }>(`invoices/${inv.id}`);
      inv.items = full.items;
    }
  );

  const customerIds = Array.from(
    new Set(invoices.map((inv) => inv.customer?.id).filter((id): id is string => Boolean(id)))
  );
  const customers = new Map<string, FacturapiCustomer>();
  await mapWithConcurrency(customerIds, CONCURRENCY, async (id) => {
    try {
      const c = await client.get<FacturapiCustomer>(`customers/${id}`);
      customers.set(id, c);
    } catch {
      // Best-effort — if a customer was deleted after the invoice was
      // stamped, fall back to blank domicilio rather than failing the report.
    }
  });

  invoices.sort((a, b) => (a.folio_number ?? 0) - (b.folio_number ?? 0));

  const byCurrency = new Map<string, FacturapiInvoice[]>();
  for (const inv of invoices) {
    const key = inv.currency ?? "MXN";
    if (!byCurrency.has(key)) byCurrency.set(key, []);
    byCurrency.get(key)!.push(inv);
  }

  const groups: ReporteCurrencyGroup[] = Array.from(byCurrency.entries()).map(([currency, invs]) => {
    const rows: ReporteInvoiceRow[] = invs.map((inv) => {
      const { subtotal, trasladado, retenido } = invoiceTotals(inv);
      return {
        folio: [inv.series, inv.folio_number].filter(Boolean).join("-") || inv.id.slice(-6),
        uuid: inv.uuid ?? "",
        fecha: inv.date,
        rfc: inv.customer?.tax_id ?? "",
        receptor: inv.customer?.legal_name ?? "",
        domicilio: formatDomicilio(inv.customer?.id ? customers.get(inv.customer.id) : undefined),
        estado: ESTADO_LABEL[inv.status] ?? inv.status,
        esComplemento: inv.type === "P",
        subtotal,
        trasladado,
        retenido,
        total:
          inv.status === "canceled" ? 0 : inv.type === "P" ? (inv.total_payment_amount ?? 0) : inv.total,
      };
    });
    const vigentes = invs.filter((inv) => inv.status !== "canceled");
    const subtotalGenerado = rows.reduce((sum, r) => sum + r.subtotal, 0);
    const totalRetenido = rows.reduce((sum, r) => sum + r.retenido, 0);
    const totalTrasladado = rows.reduce((sum, r) => sum + r.trasladado, 0);
    const totalGenerado = vigentes.reduce(
      (sum, inv) => sum + (inv.type === "P" ? (inv.total_payment_amount ?? 0) : inv.total),
      0
    );
    // Folio range is computed per group rather than globally: facturas and
    // complementos de pago use independent folio counters (e.g. "F-27" vs
    // "P-9"), which in practice always land in different currency groups
    // ("XXX" for complementos). Mixing their ranges into one global min/max
    // produced a misleading "folio 1 al 27" that implied a single contiguous
    // run when none exists.
    const groupFolios = invs.map((inv) => inv.folio_number).filter((f): f is number => typeof f === "number");
    return {
      currency,
      rows,
      subtotalGenerado,
      totalRetenido,
      totalTrasladado,
      totalGenerado,
      firstFolio: groupFolios.length ? Math.min(...groupFolios) : null,
      lastFolio: groupFolios.length ? Math.max(...groupFolios) : null,
    };
  });

  return { orgName, year, month, groups };
}

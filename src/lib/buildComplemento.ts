import type { FacturapiClient } from "./facturapi";
import type { FacturapiInvoice } from "./saveFactura";

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface FacturapiPagoInvoice {
  status?: string;
  complements?: { data?: { related_documents?: { uuid?: string; amount?: number }[] }[] }[];
}

// Prior payments must be computed from FacturAPI's own records, not our
// local `complementos_pago` cache — that cache exists for display/reporting
// convenience, but trusting it exclusively for this check let a factura get
// double-paid once when the local row lookup missed (see incident: an
// invoice recorded $110,668 + $603,830.43 in payments against a
// $603,830.43 total because a missing local row was silently treated as
// "zero prior payments" instead of an error). FacturAPI is the actual
// source of truth for what's been paid, so ask it directly every time.
export async function getPriorPayments(
  client: FacturapiClient,
  originalUuid: string | undefined,
  customerId: string | undefined
): Promise<{ priorPaid: number; count: number }> {
  if (!originalUuid) return { priorPaid: 0, count: 0 };

  let priorPaid = 0;
  let count = 0;
  let page = 1;
  // Bounded pagination — a single invoice realistically never accrues
  // anywhere near 1000 payment complements; this cap just prevents an
  // unbounded loop if something is very wrong upstream.
  const MAX_PAGES = 10;
  while (page <= MAX_PAGES) {
    const res = await client.get<{ data: FacturapiPagoInvoice[]; total_pages?: number }>("invoices", {
      type: "P",
      customer: customerId,
      limit: 100,
      page,
    });
    for (const p of res.data) {
      if (p.status === "canceled") continue;
      for (const complement of p.complements ?? []) {
        for (const d of complement.data ?? []) {
          for (const rd of d.related_documents ?? []) {
            if (rd.uuid === originalUuid) {
              priorPaid += rd.amount ?? 0;
              count++;
            }
          }
        }
      }
    }
    if (!res.total_pages || page >= res.total_pages) break;
    page++;
  }
  return { priorPaid: roundMoney(priorPaid), count };
}

// FacturAPI's own Pago (type P) PDF template already prints a
// "Documentos Relacionados" table (folio/parcialidad/saldo anterior/importe/
// saldo) and a "Recepción de Pagos" summary — this custom section must only
// add what's actually missing: the client's previous PAC rendered a full
// Impuestos DR/Totales breakdown that FacturAPI condenses into a single
// "IVA Tasa 16% = $X" line, so that's the only thing worth re-adding here.
// pdf_custom_section is raw HTML dropped into the PDF with none of
// FacturAPI's own table styling applied — inline styles are required or it
// renders as an unbordered, misaligned dump next to FacturAPI's own
// (properly styled) tables above it.
const TABLE_STYLE = 'style="width:100%;border-collapse:collapse;margin-top:4px"';
const TH_STYLE =
  'style="text-align:left;padding:4px 8px;border-bottom:2px solid #2f6fed;font-size:11px"';
const TD_STYLE = 'style="padding:4px 8px;border-bottom:1px solid #e0e0e0;font-size:11px"';

interface PagoPdfRow {
  monto: number;
  ivaBase: number;
  ivaRate: number;
  ivaAmount: number;
}

function buildPagoPdfCustomSection(params: { nodos: PagoPdfRow[] }) {
  const { nodos } = params;
  const totalMonto = roundMoney(nodos.reduce((sum, n) => sum + n.monto, 0));
  const totalIvaBase = roundMoney(nodos.reduce((sum, n) => sum + n.ivaBase, 0));
  const totalIvaAmount = roundMoney(nodos.reduce((sum, n) => sum + n.ivaAmount, 0));

  const rows = nodos
    .map((n) => {
      const ivaPct = (n.ivaRate * 100).toFixed(2).replace(/\.?0+$/, "");
      return `
        <tr>
          <td ${TD_STYLE}>$${formatMoney(n.ivaBase)}</td>
          <td ${TD_STYLE}>IVA</td>
          <td ${TD_STYLE}>Tasa</td>
          <td ${TD_STYLE}>${ivaPct}%</td>
          <td ${TD_STYLE}>$${formatMoney(n.ivaAmount)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <h4>Impuestos trasladados</h4>
    <table ${TABLE_STYLE}>
      <thead>
        <tr>
          <th ${TH_STYLE}>Base</th>
          <th ${TH_STYLE}>Impuesto</th>
          <th ${TH_STYLE}>Tipo factor</th>
          <th ${TH_STYLE}>Tasa</th>
          <th ${TH_STYLE}>Importe</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="margin-top:8px"><strong>Total traslados base IVA:</strong> $${formatMoney(totalIvaBase)}</p>
    <p><strong>Total traslados impuesto IVA:</strong> $${formatMoney(totalIvaAmount)}</p>
    <p><strong>Monto total del pago:</strong> $${formatMoney(totalMonto)}</p>
  `;
}

export interface ComplementNodoInput {
  formaPago: string;
  monto: number;
  fechaPagoStr: string; // YYYY-MM-DD
  numeroOperacion?: string;
}

export interface ComplementInput {
  facturaFacturapiId: string;
  nodos: ComplementNodoInput[];
  // Overrides the complement's receptor with a different FacturAPI customer
  // id — the factoraje case where the institution actually paying isn't the
  // original invoice's debtor (SAT/Kamina guide step 6, "Sustitución del
  // Receptor"). Omitted/undefined preserves today's behavior: the original
  // invoice's customer is embedded inline.
  receptorCustomerId?: string;
}

// Shared by POST /api/complementos and its /preview sibling so the wire
// shape (snake_case, matching the rest of this app's internal API) only has
// one place to change.
export function parseNodosBody(nodos: unknown): ComplementNodoInput[] {
  if (!Array.isArray(nodos)) return [];
  return nodos.map((n: Record<string, unknown>) => ({
    formaPago: String(n.forma_pago),
    monto: Number(n.monto),
    fechaPagoStr: String(n.fecha_pago),
    numeroOperacion: n.numero_operacion ? String(n.numero_operacion) : undefined,
  }));
}

export interface ComplementBuildResultNodo extends ComplementNodoInput {
  installment: number;
  lastBalance: number;
}

export interface ComplementBuildResult {
  inv: FacturapiInvoice;
  complementBody: Record<string, unknown>;
  nodos: ComplementBuildResultNodo[];
}

export interface ComplementBuildError {
  error: string;
  status: number;
}

// Shared by the real "emitir complemento" POST and the preview-only route —
// both must compute the exact same balance/installment/tax breakdown so the
// preview a user sees is the same document that would actually be timbrado.
export async function buildComplementForInvoice(
  client: FacturapiClient,
  input: ComplementInput
): Promise<ComplementBuildResult | ComplementBuildError> {
  const { facturaFacturapiId, nodos, receptorCustomerId } = input;

  const inv = await client.get<FacturapiInvoice>(`invoices/${facturaFacturapiId}`);

  const uuid = inv.uuid;
  const totalMontoNodos = roundMoney(nodos.reduce((sum, n) => sum + n.monto, 0));
  const total = Number(inv.total ?? totalMontoNodos);
  const customerId = typeof inv.customer?.id === "string" ? inv.customer.id : undefined;

  const { priorPaid, count } = await getPriorPayments(client, uuid, customerId);
  const startingBalance = roundMoney(total - priorPaid);

  if (startingBalance <= 0) {
    return { error: "Esta factura ya está completamente pagada", status: 400 };
  }
  if (totalMontoNodos - startingBalance > 0.01) {
    return { error: `El monto excede el saldo pendiente ($${startingBalance})`, status: 400 };
  }

  // The complement's tax breakdown must mirror the rate actually used on
  // the original invoice (this app lets users pick 16% or 8% frontera per
  // invoice — see ivaRate in factura-form.tsx), not a fixed guess.
  const ivaEntry = inv.items
    ?.flatMap((it) => it.product?.taxes ?? [])
    .find((t) => t.type === "IVA" && !t.withholding);
  const ivaRate = ivaEntry?.rate ?? 0.16;

  // Each node's last_balance is the running balance before it is applied —
  // node 1 sees the current saldo pendiente, node 2 sees what's left after
  // node 1, and so on. installment increments per node, continuing from
  // whatever installment count FacturAPI already has on record.
  let runningBalance = startingBalance;
  const resultNodos: ComplementBuildResultNodo[] = [];
  const dataEntries: Record<string, unknown>[] = [];
  const pdfNodos: PagoPdfRow[] = [];

  nodos.forEach((nodo, i) => {
    const installment = count + i + 1;
    const lastBalance = runningBalance;
    const ivaBase = Math.round((nodo.monto / (1 + ivaRate)) * 1e6) / 1e6;
    const ivaAmount = roundMoney(nodo.monto - ivaBase);
    runningBalance = roundMoney(runningBalance - nodo.monto);

    resultNodos.push({ ...nodo, installment, lastBalance });
    pdfNodos.push({ monto: nodo.monto, ivaBase, ivaRate, ivaAmount });
    dataEntries.push({
      payment_form: nodo.formaPago,
      date: `${nodo.fechaPagoStr}T12:00:00`,
      ...(nodo.numeroOperacion ? { numOperacion: nodo.numeroOperacion } : {}),
      related_documents: [
        {
          uuid,
          amount: nodo.monto,
          installment,
          last_balance: lastBalance,
          taxes: [{ base: ivaBase, type: "IVA", rate: ivaRate, factor: "Tasa", withholding: false }],
          taxability: "02",
        },
      ],
    });
  });

  // FacturAPI returns read-only fields on the customer sub-object; strip
  // them before re-submitting it inline on the complement invoice.
  const customerObj = { ...(inv.customer ?? {}) };
  delete customerObj.id;
  delete customerObj.created_at;
  delete customerObj.updated_at;
  delete customerObj.livemode;

  const complementBody = {
    type: "P",
    customer: receptorCustomerId ?? customerObj,
    pdf_custom_section: buildPagoPdfCustomSection({ nodos: pdfNodos }),
    complements: [
      {
        type: "pago",
        data: dataEntries,
      },
    ],
  };

  return { inv, complementBody, nodos: resultNodos };
}

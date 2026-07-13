import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { complementosPago, facturas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { saveFactura, type FacturapiInvoice } from "@/lib/saveFactura";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({
        id: complementosPago.id,
        facturapiId: complementosPago.facturapiId,
        uuid: complementosPago.uuid,
        facturaId: complementosPago.facturaId,
        fechaPago: complementosPago.fechaPago,
        monto: complementosPago.monto,
        formaPago: complementosPago.formaPago,
        createdAt: complementosPago.createdAt,
        facturaFacturapiId: facturas.facturapiId,
        facturaCustomerName: facturas.customerName,
        facturaFolio: facturas.folioNumber,
        facturaSerie: facturas.serie,
      })
      .from(complementosPago)
      .leftJoin(facturas, eq(facturas.id, complementosPago.facturaId))
      .where(eq(complementosPago.orgId, orgId))
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const body = await req.json();
  const facturaFacturapiId: string = body.factura_facturapi_id;
  const formaPago: string = body.forma_pago;
  const monto = Number(body.monto);
  const fechaPagoStr: string = body.fecha_pago; // YYYY-MM-DD

  try {
    const inv = await client.get<FacturapiInvoice>(`invoices/${facturaFacturapiId}`);

    const uuid = inv.uuid;
    const total = Number(inv.total ?? monto);

    const { installment, lastBalance } = await withOrg(orgId, async (tx) => {
      const [localFactura] = await tx
        .select({ id: facturas.id })
        .from(facturas)
        .where(eq(facturas.facturapiId, facturaFacturapiId))
        .limit(1);
      if (!localFactura) return { installment: 1, lastBalance: total };

      const priorPayments = await tx
        .select({ monto: complementosPago.monto })
        .from(complementosPago)
        .where(eq(complementosPago.facturaId, localFactura.id));
      const priorPaid = priorPayments.reduce((sum, p) => sum + p.monto, 0);
      return {
        installment: priorPayments.length + 1,
        lastBalance: roundMoney(total - priorPaid),
      };
    });

    if (lastBalance <= 0) {
      return NextResponse.json({ error: "Esta factura ya está completamente pagada" }, { status: 400 });
    }
    if (monto - lastBalance > 0.01) {
      return NextResponse.json(
        { error: `El monto excede el saldo pendiente ($${lastBalance})` },
        { status: 400 }
      );
    }

    // The complement's tax breakdown must mirror the rate actually used on
    // the original invoice (this app lets users pick 16% or 8% frontera per
    // invoice — see ivaRate in crear-factura-dialog.tsx), not a fixed guess.
    const ivaEntry = inv.items
      ?.flatMap((it) => it.product?.taxes ?? [])
      .find((t) => t.type === "IVA" && !t.withholding);
    const ivaRate = ivaEntry?.rate ?? 0.16;
    const ivaBase = Math.round((monto / (1 + ivaRate)) * 1e6) / 1e6;
    // FacturAPI returns read-only fields on the customer sub-object; strip
    // them before re-submitting it inline on the complement invoice.
    const customerObj = { ...(inv.customer ?? {}) };
    delete customerObj.id;
    delete customerObj.created_at;
    delete customerObj.updated_at;
    delete customerObj.livemode;

    const complementBody = {
      type: "P",
      customer: customerObj,
      complements: [
        {
          type: "pago",
          data: [
            {
              payment_form: formaPago,
              date: `${fechaPagoStr}T12:00:00`,
              related_documents: [
                {
                  uuid,
                  amount: monto,
                  installment,
                  last_balance: lastBalance,
                  taxes: [{ base: ivaBase, type: "IVA", rate: ivaRate, factor: "Tasa", withholding: false }],
                  taxability: "02",
                },
              ],
            },
          ],
        },
      ],
    };

    const comp = await client.post<{ id: string; uuid?: string }>("invoices", complementBody);

    await withOrg(orgId, async (tx) => {
      const localFactura = await saveFactura(tx, orgId, inv, null);
      await tx.insert(complementosPago).values({
        orgId,
        facturapiId: comp.id,
        uuid: comp.uuid ?? null,
        facturaId: localFactura.id,
        fechaPago: fechaPagoStr,
        monto,
        formaPago,
      });
    });

    return NextResponse.json(comp, { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

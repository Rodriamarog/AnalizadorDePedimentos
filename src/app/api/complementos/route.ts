import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { complementosPago, facturas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { saveFactura, type FacturapiInvoice } from "@/lib/saveFactura";

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
    const list = await client.get<{ data: FacturapiInvoice[] }>("invoices", {
      q: facturaFacturapiId,
      limit: 1,
    });
    const inv = list.data?.[0];
    if (!inv) {
      return NextResponse.json({ error: "Factura no encontrada en FacturAPI" }, { status: 404 });
    }

    const uuid = inv.uuid;
    const total = Number(inv.total ?? monto);

    // IVA 16% assumed — standard for mercancía en México, matches the old app.
    const ivaBase = Math.round((monto / 1.16) * 1e6) / 1e6;
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
                  installment: 1,
                  last_balance: total,
                  taxes: [{ base: ivaBase, type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
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

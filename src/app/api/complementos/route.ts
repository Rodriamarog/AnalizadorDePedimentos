import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { complementosPago, facturas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { saveFactura } from "@/lib/saveFactura";
import { buildComplementForInvoice, parseNodosBody } from "@/lib/buildComplemento";

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
  const nodos = parseNodosBody(body.nodos);

  try {
    const result = await buildComplementForInvoice(client, {
      facturaFacturapiId,
      nodos,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { inv, complementBody } = result;

    const comp = await client.post<{ id: string; uuid?: string }>("invoices", complementBody);

    await withOrg(orgId, async (tx) => {
      const localFactura = await saveFactura(tx, orgId, inv, null);
      for (const nodo of result.nodos) {
        await tx.insert(complementosPago).values({
          orgId,
          facturapiId: comp.id,
          uuid: comp.uuid ?? null,
          facturaId: localFactura.id,
          fechaPago: nodo.fechaPagoStr,
          monto: nodo.monto,
          formaPago: nodo.formaPago,
        });
      }
    });

    return NextResponse.json(comp, { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

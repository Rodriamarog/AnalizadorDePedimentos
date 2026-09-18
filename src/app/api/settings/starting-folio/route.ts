import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getStartingFolios, hasIssuedInvoiceOfType, setStartingFolio, StartingFolioType } from "@/lib/startingFolio";

export async function GET() {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const [folios, facturaLocked, notaCreditoLocked] = await Promise.all([
    getStartingFolios(orgId),
    hasIssuedInvoiceOfType(orgId, "I"),
    hasIssuedInvoiceOfType(orgId, "E"),
  ]);

  return NextResponse.json({
    factura: { folioNumber: folios.I, locked: facturaLocked },
    notaCredito: { folioNumber: folios.E, locked: notaCreditoLocked },
  });
}

export async function PUT(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const { type, folioNumber } = await req.json();
  if (type !== "I" && type !== "E") {
    return NextResponse.json({ error: 'type debe ser "I" o "E"' }, { status: 400 });
  }
  if (folioNumber !== null && typeof folioNumber !== "number") {
    return NextResponse.json({ error: "folioNumber debe ser un número o null" }, { status: 400 });
  }

  const result = await setStartingFolio(orgId, type as StartingFolioType, folioNumber);
  if (result) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true });
}

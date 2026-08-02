import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { requireOrgId } from "@/lib/auth";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";
import { facturas } from "@/lib/db/schema";

interface FacturapiInvoiceListItem {
  id: string;
  date?: string;
  type?: string;
  uuid?: string;
  related_documents?: { documents?: string[] }[];
  related_folio?: string | null;
  [key: string]: unknown;
}

function relatedUuidOf(f: FacturapiInvoiceListItem): string | undefined {
  return f.related_documents?.[0]?.documents?.[0];
}

export async function GET(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const { searchParams } = req.nextUrl;
  const typeParam = searchParams.get("type");
  // No explicit `type` means "the facturas list" — fetch Ingreso and Egreso
  // (nota de crédito) both, since FacturAPI's `type` filter only accepts one
  // value per call. Deliberately excludes P/N (complementos de pago and
  // nómina, tracked in their own tables/UI) and T (carta porte, out of this
  // ticket's scope) so they don't get mixed into this list.
  const types = typeParam ? [typeParam] : ["I", "E"];
  try {
    const results = await Promise.all(
      types.map((type) =>
        client.get<{ data: FacturapiInvoiceListItem[] }>("invoices", {
          type,
          q: searchParams.get("q") ?? undefined,
          customer: searchParams.get("customer") ?? undefined,
          page: searchParams.get("page") ?? "1",
          limit: searchParams.get("limit") ?? "50",
          payment_method: searchParams.get("payment_method") ?? undefined,
        })
      )
    );
    // Fetching I and E separately (FacturAPI's `type` filter takes one value)
    // can return up to 2x `limit` rows combined — re-apply `limit` after
    // merging so the response honors the caller's requested page size, same
    // as a single-type call would.
    const limit = Number(searchParams.get("limit") ?? "50");
    const merged = results
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => ((a.date ?? "") === (b.date ?? "") ? 0 : (a.date ?? "") < (b.date ?? "") ? 1 : -1))
      .slice(0, limit);

    const relatedUuids = [...new Set(merged.map(relatedUuidOf).filter((uuid) => uuid != null))];
    if (relatedUuids.length > 0) {
      const relatedRows = await withOrg(orgId, (tx) =>
        tx
          .select({ uuid: facturas.uuid, serie: facturas.serie, folioNumber: facturas.folioNumber })
          .from(facturas)
          .where(inArray(facturas.uuid, relatedUuids))
      );
      const folioByUuid = new Map(
        relatedRows.map((r) => [r.uuid, [r.serie, r.folioNumber].filter(Boolean).join("-")])
      );
      for (const f of merged) {
        const relatedUuid = relatedUuidOf(f);
        if (relatedUuid) f.related_folio = folioByUuid.get(relatedUuid) ?? null;
      }
    }

    // Pagination metadata (total_pages, etc.) from FacturAPI's raw response is
    // intentionally dropped here — no consumer of this route uses it, since
    // page.tsx fetches a single unpaginated batch (limit=100, no page param).
    return NextResponse.json({ data: merged });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof NextResponse) return client;

  const body = await req.json();
  const pedimentoId: string | null = body.pedimento_id ?? null;
  delete body.pedimento_id;

  try {
    const inv = await client.post<{ id: string }>("invoices", body);
    await withOrg(orgId, (tx) => saveFactura(tx, orgId, inv, pedimentoId));
    return NextResponse.json(inv, { status: 201 });
  } catch (e) {
    if (e instanceof FacturapiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

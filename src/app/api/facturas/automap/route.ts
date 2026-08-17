import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { productos, satClaves } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { runAutomap, runAutomapDescripciones } from "@/lib/automap";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";

interface RequestRow {
  id: string;
  descripcion: string;
  fraccion?: string;
}

interface ResultRow {
  id: string;
  key: string | null;
  description: string | null;
  confidence: string | null;
}

async function classifyFraccionRows(orgId: string, fraccionRows: RequestRow[]): Promise<ResultRow[] | NextResponse> {
  const fracciones = [...new Set(fraccionRows.map((r) => r.fraccion!.trim()))];
  const cached = await withOrg(orgId, (tx) =>
    tx
      .select({ fraccion: productos.fraccion, claveProdServ: productos.claveProdServ, descripcionSat: productos.descripcionSat, confidence: productos.confidence })
      .from(productos)
      .where(and(eq(productos.orgId, orgId), inArray(productos.fraccion, fracciones)))
  );
  const cacheMap = new Map(cached.filter((c) => c.claveProdServ).map((c) => [c.fraccion, c]));

  const uncachedFracciones = fracciones.filter((f) => !cacheMap.has(f));
  if (uncachedFracciones.length > 0) {
    const facturapiClient = await getOrgFacturapiClient(orgId);
    if (facturapiClient instanceof NextResponse) return facturapiClient;

    const partidas = uncachedFracciones.map((fraccion) => ({
      fraccion,
      descripcion: fraccionRows.find((r) => r.fraccion!.trim() === fraccion)!.descripcion,
    }));
    const automapResult = await runAutomap(partidas, new Set(), facturapiClient);

    await withOrg(orgId, async (tx) => {
      for (const c of automapResult.classifications) {
        if (!c.key) continue;
        const orig = partidas.find((p) => p.fraccion === c.fraccion)!;

        const [catalogRow] = await tx
          .select({ description: satClaves.description })
          .from(satClaves)
          .where(eq(satClaves.key, c.key))
          .limit(1);
        const confirmedDesc = catalogRow?.description ?? c.description ?? "";
        let confidence = c.confidence;
        if (!catalogRow && confidence === "high") confidence = "medium";

        await tx
          .insert(productos)
          .values({
            orgId,
            fraccion: c.fraccion,
            descripcion: orig.descripcion,
            claveProdServ: c.key,
            descripcionSat: confirmedDesc,
            confidence,
          })
          .onConflictDoUpdate({
            target: [productos.orgId, productos.fraccion],
            set: { claveProdServ: c.key, descripcionSat: confirmedDesc, confidence },
          });

        cacheMap.set(c.fraccion, { fraccion: c.fraccion, claveProdServ: c.key, descripcionSat: confirmedDesc, confidence });
      }
    });
  }

  return fraccionRows.map((r) => {
    const cached2 = cacheMap.get(r.fraccion!.trim());
    return {
      id: r.id,
      key: cached2?.claveProdServ ?? null,
      description: cached2?.descripcionSat ?? null,
      confidence: cached2?.confidence ?? null,
    };
  });
}

async function classifyDescRows(descRows: RequestRow[]): Promise<ResultRow[]> {
  const automapResult = await runAutomapDescripciones(descRows.map((r) => ({ id: r.id, descripcion: r.descripcion })));
  return automapResult.classifications.map((c) => ({
    id: c.id,
    key: c.key,
    description: c.description,
    confidence: c.confidence,
  }));
}

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const body = await req.json();
  const rows: RequestRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const toMap = rows.filter((r) => r.id && r.descripcion?.trim());

  if (toMap.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const fraccionRows = toMap.filter((r) => r.fraccion?.trim());
  const descRows = toMap.filter((r) => !r.fraccion?.trim());

  try {
    // Neither path depends on the other's output, so run them concurrently —
    // each is a multi-turn Gemini classification pass that can take up to
    // ~2 minutes on its own.
    const [fraccionResults, descResults] = await Promise.all([
      fraccionRows.length > 0 ? classifyFraccionRows(orgId, fraccionRows) : Promise.resolve([]),
      descRows.length > 0 ? classifyDescRows(descRows) : Promise.resolve([]),
    ]);

    if (fraccionResults instanceof NextResponse) return fraccionResults;

    return NextResponse.json({ results: [...fraccionResults, ...descResults] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al automapear" },
      { status: 500 }
    );
  }
}

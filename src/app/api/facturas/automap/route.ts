import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { runAutomapDescripciones } from "@/lib/automap";

interface RequestRow {
  id: string;
  descripcion: string;
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

  let automapResult;
  try {
    automapResult = await runAutomapDescripciones(
      toMap.map((r) => ({ id: r.id, descripcion: r.descripcion }))
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al automapear" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    results: automapResult.classifications.map((c) => ({
      id: c.id,
      key: c.key,
      description: c.description,
      confidence: c.confidence,
    })),
  });
}

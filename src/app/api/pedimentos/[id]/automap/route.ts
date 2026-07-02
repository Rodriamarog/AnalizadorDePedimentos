import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { pedimentos, partidas, productos, satClaves } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { runAutomap } from "@/lib/automap";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;
  const { id } = await params;

  const { pedimentoPartidas, alreadyMapped } = await withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
    if (!pedimento) return { pedimentoPartidas: null, alreadyMapped: null };

    const rows = await tx
      .select({ fraccion: partidas.fraccion, descripcion: partidas.descripcion })
      .from(partidas)
      .where(eq(partidas.pedimentoId, id));

    const mapped = await tx
      .select({ fraccion: productos.fraccion })
      .from(productos)
      .where(eq(productos.orgId, orgId));

    return { pedimentoPartidas: rows, alreadyMapped: new Set(mapped.map((m) => m.fraccion)) };
  });

  if (!pedimentoPartidas) {
    return NextResponse.json({ error: "Pedimento no encontrado" }, { status: 404 });
  }

  let automapResult;
  try {
    automapResult = await runAutomap(pedimentoPartidas, alreadyMapped!);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al automapear" },
      { status: 500 }
    );
  }

  if (automapResult.message) {
    return NextResponse.json({ mapped: 0, results: [], message: automapResult.message });
  }

  const partidaByFraccion = new Map(pedimentoPartidas.map((p) => [p.fraccion, p]));

  const results = await withOrg(orgId, async (tx) => {
    const out = [];
    for (const c of automapResult.classifications) {
      const orig = partidaByFraccion.get(c.fraccion);
      if (!orig) continue;

      if (!c.key) {
        out.push({ fraccion: c.fraccion, key: null, status: "skipped" as const, in_catalog: false, description: null });
        continue;
      }

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
          unitKey: c.unitKey,
          confidence,
        })
        .onConflictDoUpdate({
          target: [productos.orgId, productos.fraccion],
          set: {
            claveProdServ: c.key,
            descripcionSat: confirmedDesc,
            unitKey: c.unitKey,
            confidence,
          },
        });

      out.push({
        fraccion: c.fraccion,
        key: c.key,
        status: "saved" as const,
        in_catalog: !!catalogRow,
        description: confirmedDesc,
        unit_key: c.unitKey,
        confidence,
      });
    }
    return out;
  });

  const saved = results.filter((r) => r.status === "saved").length;
  return NextResponse.json({ mapped: saved, skipped: results.length - saved, results });
}

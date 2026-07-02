import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { parsePedimento } from "@/lib/parser";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo permitido (20 MB)" },
      { status: 413 }
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "pedimento-"));
  const pdfPath = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));

    let result;
    try {
      result = await parsePedimento(pdfPath);
    } catch (e) {
      return NextResponse.json(
        { error: `Error al procesar el PDF: ${e instanceof Error ? e.message : e}` },
        { status: 422 }
      );
    }

    return withOrg(orgId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(pedimentos)
        .where(eq(pedimentos.pedimentoNum, result.pedimentoNum))
        .limit(1);

      if (existing) {
        const existingPartidas = await tx
          .select()
          .from(partidas)
          .where(eq(partidas.pedimentoId, existing.id));
        return NextResponse.json({
          id: existing.id,
          _duplicate: true,
          pedimentoNum: existing.pedimentoNum,
          importador: existing.importador,
          tipoCambio: existing.tipoCambio,
          dta: existing.dta ?? result.dta,
          igi: existing.igi ?? result.igi,
          prv: existing.prv ?? result.prv,
          partidas: existingPartidas,
        });
      }

      const [pedimento] = await tx
        .insert(pedimentos)
        .values({
          orgId,
          pedimentoNum: result.pedimentoNum,
          importador: result.importador,
          tipoCambio: result.tipoCambio,
          pdfFilename: file.name,
          dta: result.dta,
          igi: result.igi,
          prv: result.prv,
        })
        .returning();

      if (result.partidas.length > 0) {
        await tx.insert(partidas).values(
          result.partidas.map((p) => ({
            orgId,
            pedimentoId: pedimento.id,
            sec: p.sec,
            fraccion: p.fraccion,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            valAduana: p.valAduana,
            valComercial: p.valComercial,
            precioUnitario: p.precioUnitario,
            tieneIncrementables: p.tieneIncrementables,
            umc: p.umc,
          }))
        );
      }

      return NextResponse.json({ ...pedimento, partidas: result.partidas });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

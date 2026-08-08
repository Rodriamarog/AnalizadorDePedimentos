import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { parsePedimento, ParsedPedimento } from "@/lib/parser";
import { parseArchivoM } from "@/lib/parserArchivoM";
import { pedimentos, partidas, productos } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { umcToUnitKey } from "@/lib/umc";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }
  const lowerName = file.name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  // Archivo M files usually end in .txt, but some systems export them with a
  // numeric "fecha juliana" style extension instead (e.g. archivoM-....205).
  const isArchivoM = !isPdf && (lowerName.endsWith(".txt") || /\.\d+$/.test(lowerName));
  if (!isPdf && !isArchivoM) {
    return NextResponse.json(
      { error: "Solo se aceptan archivos PDF o archivo M (.txt o con extensión numérica)" },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo permitido (20 MB)" },
      { status: 413 }
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "pedimento-"));
  try {
    let result: ParsedPedimento;
    if (isArchivoM) {
      try {
        result = parseArchivoM(await file.text());
      } catch (e) {
        return NextResponse.json(
          { error: `Error al procesar el archivo M: ${e instanceof Error ? e.message : e}` },
          { status: 422 }
        );
      }
    } else {
      const pdfPath = join(dir, `${randomUUID()}.pdf`);
      await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));
      try {
        result = await parsePedimento(pdfPath);
      } catch (e) {
        return NextResponse.json(
          { error: `Error al procesar el PDF: ${e instanceof Error ? e.message : e}` },
          { status: 422 }
        );
      }
    }

    try {
      return await withOrg(orgId, async (tx) => {
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
            pesoBruto: existing.pesoBruto ?? result.pesoBruto,
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
            rfc: result.rfc,
            domicilioFiscal: result.domicilioFiscal,
            regimen: result.regimen,
            facturaNumero: result.facturaNumero,
            fechaPedimento: result.fechaPedimento,
            fechaEntrada: result.fechaEntrada,
            fechaPago: result.fechaPago,
            claveAduana: result.claveAduana,
            pesoBruto: result.pesoBruto,
          })
          .returning();

        if (result.partidas.length > 0) {
          await tx.insert(partidas).values(
            result.partidas.map((p) => ({
              orgId,
              pedimentoId: pedimento.id,
              sec: p.sec,
              fraccion: p.fraccion,
              subd: p.subd,
              descripcion: p.descripcion,
              marca: p.marca,
              paisOrigen: p.paisOrigen,
              nomClave: p.nomClave,
              cantidad: p.cantidad,
              valAduana: p.valAduana,
              valComercial: p.valComercial,
              precioUnitario: p.precioUnitario,
              tieneIncrementables: p.tieneIncrementables,
              umc: p.umc,
              pesoKg: p.pesoKg,
            }))
          );

          // Pre-fill the SAT unit key deterministically from each partida's UMC
          // code so the "Unidad" column is already correct on upload, without
          // waiting on the AI automap (which only handles ClaveProdServ).
          // claveProdServ is left null — the fracción still needs that mapped.
          // onConflictDoNothing so an already-mapped fracción is never touched.
          const seenFracciones = new Map<string, (typeof result.partidas)[number]>();
          for (const p of result.partidas) {
            if (!seenFracciones.has(p.fraccion)) seenFracciones.set(p.fraccion, p);
          }
          await tx
            .insert(productos)
            .values(
              [...seenFracciones.values()].map((p) => ({
                orgId,
                fraccion: p.fraccion,
                descripcion: p.descripcion,
                claveProdServ: null,
                unitKey: umcToUnitKey(p.umc),
              }))
            )
            .onConflictDoNothing({ target: [productos.orgId, productos.fraccion] });
        }

        return NextResponse.json({ ...pedimento, partidas: result.partidas });
      });
    } catch (e) {
      console.error("Error al guardar el pedimento en la base de datos:", e);
      return NextResponse.json(
        { error: `Error al guardar el pedimento: ${e instanceof Error ? e.message : e}` },
        { status: 500 }
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

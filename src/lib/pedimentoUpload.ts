import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { parsePedimento, ParsedPedimento } from "./parser";
import { parseArchivoM } from "./parserArchivoM";
import { pedimentos, partidas, productos } from "./db/schema";
import { withOrg } from "./db/withOrg";
import { umcToUnitKey } from "./umc";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isPdfFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

// Archivo M files usually end in .txt, but some systems export them with a
// numeric "fecha juliana" style extension instead (e.g. archivoM-....205).
export function isArchivoMFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return !isPdfFilename(lower) && (lower.endsWith(".txt") || /\.\d+$/.test(lower));
}

export class PedimentoUploadError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Parses a pedimento upload (PDF or Archivo M) and persists it, deduping on
// pedimentoNum per org — shared by the internal /api/parse route and the
// public /api/v1/pedimentos job runner (#52), which must reach the exact
// same result the internal upload flow does.
export interface PedimentoUploadResult {
  pedimento: typeof pedimentos.$inferSelect;
  partidas: (typeof partidas.$inferSelect)[];
  duplicate: boolean;
  // The parser's own partida shape (no id/orgId/pedimentoId) — only set when
  // `!duplicate`. Kept alongside the persisted `partidas` rows so the
  // internal /api/parse route can reproduce its pre-existing response shape
  // (which echoes the parser output directly) without re-parsing.
  parsedPartidas: ParsedPedimento["partidas"] | null;
}

export async function parseAndPersistPedimento(orgId: string, file: File): Promise<PedimentoUploadResult> {
  const isPdf = isPdfFilename(file.name);
  const isArchivoM = isArchivoMFilename(file.name);
  if (!isPdf && !isArchivoM) {
    throw new PedimentoUploadError(
      "Solo se aceptan archivos PDF o archivo M (.txt o con extensión numérica)",
      400
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PedimentoUploadError("El archivo excede el tamaño máximo permitido (20 MB)", 413);
  }

  const dir = await mkdtemp(join(tmpdir(), "pedimento-"));
  try {
    let result: ParsedPedimento;
    if (isArchivoM) {
      try {
        result = parseArchivoM(await file.text());
      } catch (e) {
        throw new PedimentoUploadError(`Error al procesar el archivo M: ${e instanceof Error ? e.message : e}`, 422);
      }
    } else {
      const pdfPath = join(dir, `${randomUUID()}.pdf`);
      await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));
      try {
        result = await parsePedimento(pdfPath);
      } catch (e) {
        throw new PedimentoUploadError(`Error al procesar el PDF: ${e instanceof Error ? e.message : e}`, 422);
      }
    }

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
        return { pedimento: existing, partidas: existingPartidas, duplicate: true, parsedPartidas: null };
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
          cvePedimento: result.cvePedimento,
          facturaNumero: result.facturaNumero,
          fechaPedimento: result.fechaPedimento,
          fechaEntrada: result.fechaEntrada,
          fechaPago: result.fechaPago,
          claveAduana: result.claveAduana,
          pesoBruto: result.pesoBruto,
          identificadoresDocAduanero: result.identificadoresDocAduanero,
        })
        .returning();

      let insertedPartidas: (typeof partidas.$inferSelect)[] = [];
      if (result.partidas.length > 0) {
        insertedPartidas = await tx
          .insert(partidas)
          .values(
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
          )
          .returning();

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

      return { pedimento, partidas: insertedPartidas, duplicate: false, parsedPartidas: result.partidas };
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

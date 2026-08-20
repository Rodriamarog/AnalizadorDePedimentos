import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { umcToUnitKey } from "./umc";

const execFileAsync = promisify(execFile);

export interface Partida {
  sec: number;
  fraccion: string;
  subd: string | null;
  descripcion: string;
  marca: string | null;
  paisOrigen: string | null;
  nomClave: string | null;
  cantidad: number;
  valAduana: number;
  valComercial: number;
  precioUnitario: number;
  tieneIncrementables: boolean;
  umc: string | null;
  // Weight in kg for this partida, read from the pedimento's "unidad de
  // tarifa" (UMT) columns — printed right before the P.V/C/P.O/D country
  // codes on the partida header row. UMT shares the same unit catalog as UMC
  // (see umc.ts), so this is only a real weight when the UMT clave maps to
  // kilograms; otherwise the tariff unit is something else (piece, liter,
  // etc.) and there's no per-partida weight to derive.
  pesoKg: number | null;
}

export interface ParsedPedimento {
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  dta: number | null;
  igi: number | null;
  prv: number | null;
  rfc: string | null;
  domicilioFiscal: string | null;
  regimen: string | null;
  facturaNumero: string | null;
  fechaPedimento: string | null;
  fechaEntrada: string | null;
  fechaPago: string | null;
  claveAduana: string | null;
  // Total shipment weight in kg, from the pedimento header's "PESO BRUTO"
  // field — a single aggregate for the whole pedimento, unlike Partida.pesoKg
  // which is derived per partida from the UMT columns.
  pesoBruto: number | null;
  // Header-level "ED" (Documento digitalizado) identificadores (Anexo 22
  // Apéndice 8, nivel G) — each complemento 1 is a VUCEM reference number for
  // one document annexed to the pedimento (factura, certificado de origen,
  // dictamen NOM, the carta porte contract itself, etc.). Feeds Carta Porte's
  // DocumentacionAduanera.IdentDocAduanero (see buildCartaPorte.ts).
  identificadoresDocAduanero: string[];
  partidas: Partida[];
}

// pdftotext -layout reconstructs visual reading order the same way
// pdfplumber's extract_text() did in the old Python parser, but it also
// preserves fixed-width column padding (lots of literal whitespace) that
// pdfplumber's word-based extraction didn't produce. Collapsing runs of
// whitespace to a single space makes the two outputs equivalent for every
// downstream regex/token check, which all originally assumed pdfplumber's
// tighter spacing.
function collapseWhitespace(line: string): string {
  return line.replace(/[ \t]+/g, " ").trim();
}

async function extractPages(pdfPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], {
    maxBuffer: 1024 * 1024 * 64,
  });
  return stdout.split("\f");
}

function cleanPage(text: string, isFirst: boolean): string {
  const lines = text.split("\n");
  const clean: string[] = [];
  let skip = false;
  const skipStartPrefixes = [
    "Cte:",
    "PEDIMENTO Página",
    "Página ",
    "ANEXO DEL PEDIMENTO",
    "FRACCIONSUBD",
    "NÚM",
    "IDENT",
    "IFICA",
    "CIÓN",
    "COME",
    "RCIAL",
    "SEC DESCRIPCION",
    "VAL ADU/USD",
    "PARTIDAS",
  ];

  for (const rawLine of lines) {
    const stripped = collapseWhitespace(rawLine);
    if (stripped.startsWith("AGENTE ADUANAL")) {
      skip = true;
    }
    if (skip) {
      if (stripped.startsWith("PARTIDAS") || stripped.startsWith("***")) {
        skip = false;
      }
      continue;
    }
    if (skipStartPrefixes.some((p) => stripped.startsWith(p))) {
      continue;
    }
    if (!isFirst && /^\d+\s+\d+\s+\d+\s+\d+\s+IMP\b/.test(stripped)) {
      continue;
    }
    if (!isFirst && stripped.startsWith("NUM. PEDIMENTO:")) {
      continue;
    }
    clean.push(stripped);
  }
  return clean.join("\n");
}

// Converts a DD-MM-YYYY or DD/MM/YYYY date (the only formats the pedimento
// prints) to ISO YYYY-MM-DD for storage. Returns null if it doesn't match.
function toIsoDate(date: string | undefined): string | null {
  if (!date) return null;
  const m = date.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function extractHeaderInfo(fullText: string): {
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  rfc: string | null;
  domicilioFiscal: string | null;
  regimen: string | null;
  facturaNumero: string | null;
  fechaPedimento: string | null;
  fechaEntrada: string | null;
  fechaPago: string | null;
  claveAduana: string | null;
  pesoBruto: number | null;
} {
  let pedimentoNum = "";
  let importador = "";
  let tipoCambio = 0;

  let m = fullText.match(/NUM\. PEDIMENTO:\s*(.+?)\s*T\. OPER/);
  if (m) pedimentoNum = m[1].trim();

  m = fullText.match(/RAZON SOCIAL:\s*\n(.+)/);
  // The line following "RAZON SOCIAL:" starts with "CURP: <curp>" ahead of
  // the actual name (the pedimento prints "Clave en el RFC: ... NOMBRE..."
  // and "CURP: ..." as column headers on one line, with their values
  // starting on the next), so strip that prefix to get just the name.
  if (m) importador = m[1].replace(/^CURP:\s*\S+\s*/, "").trim();

  m = fullText.match(/TIPO CAMBIO:\s*([\d.,]+)/);
  if (m) tipoCambio = parseFloat(m[1].replace(/,/g, ""));

  let rfc: string | null = null;
  m = fullText.match(/Clave en el RFC:\s*(\S+)\s+NOMBRE, DENOMINACION O RAZON SOCIAL/);
  if (m) rfc = m[1].trim();

  let domicilioFiscal: string | null = null;
  m = fullText.match(/DOMICILIO:(.+)\n\s*(.+)\n/);
  if (m) {
    // The pedimento spells out "MEXICO (ESTADOS UNIDOS MEXICANOS)" in full;
    // drop that redundant parenthetical to match how these addresses are
    // conventionally written on the inspection request (just the country
    // name), same as this org's own hand-filled sample docs do.
    domicilioFiscal = `${m[1].trim()} ${m[2].trim()}`
      .replace(/\s*\(ESTADOS UNIDOS MEXICANOS\)\s*$/i, "")
      .trim();
  }

  let regimen: string | null = null;
  m = fullText.match(/REGIMEN:\s*(\S+)/);
  if (m) regimen = m[1].trim();

  let facturaNumero: string | null = null;
  m = fullText.match(/NUM\. FACTURA[^\n]*\n\s*(\S+)\s+\d{2}\/\d{2}\/\d{4}/);
  if (m) facturaNumero = m[1].trim();

  const fechaPedimento = toIsoDate(fullText.match(/Fecha:(\d{2}-\d{2}-\d{4})/)?.[1]);
  const fechaEntrada = toIsoDate(fullText.match(/^ENTRADA\s+(\d{2}\/\d{2}\/\d{4})/m)?.[1]);
  const fechaPago = toIsoDate(fullText.match(/^PAGO\s+(\d{2}\/\d{2}\/\d{4})/m)?.[1]);

  let claveAduana: string | null = null;
  m = fullText.match(/ADUANA E\/S:\s*(\d+)/);
  if (m) claveAduana = m[1].trim();

  let pesoBruto: number | null = null;
  m = fullText.match(/PESO BRUTO:\s*([\d.,]+)/);
  if (m) pesoBruto = parseFloat(m[1].replace(/,/g, ""));

  return {
    pedimentoNum,
    importador,
    tipoCambio,
    rfc,
    domicilioFiscal,
    regimen,
    facturaNumero,
    fechaPedimento,
    pesoBruto,
    fechaEntrada,
    fechaPago,
    claveAduana,
  };
}

interface PartidaHeader {
  sec: number;
  fraccion: string;
  subd: string | null;
  cantidad: number;
  umc: string | null;
  paisOrigen: string | null;
  pesoKg: number | null;
}

function isPartidaHeader(line: string): PartidaHeader | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 10) return null;

  if (!/^\d+$/.test(tokens[0])) return null;
  const sec = parseInt(tokens[0], 10);

  const fraccion = tokens[1];
  if (!/^\d{8}$/.test(fraccion)) return null;

  const cantidad = Number(tokens[6]);
  if (Number.isNaN(cantidad)) return null;

  const umc = tokens.length > 5 ? tokens[5] : null;
  const subd = tokens.length > 2 ? tokens[2] : null;
  // Tokens 9/10 are the P.V/C and P.O/D country codes (e.g. "USA CHN"); not
  // every pedimento line has both populated, so guard the index.
  const paisOrigen = tokens.length > 10 ? tokens[10] : null;
  // Tokens 7/8 are the UMT (unidad de tarifa) clave and its cantidad, printed
  // right before the P.V/C/P.O/D columns. Only trust this as a weight when
  // the UMT clave maps to kilograms — for fracciones tariffed by piece,
  // liter, etc. this cantidad isn't a weight at all.
  const umtClave = tokens.length > 7 ? tokens[7] : null;
  const cantidadUmt = tokens.length > 8 ? Number(tokens[8]) : NaN;
  const pesoKg =
    umtClave && umcToUnitKey(umtClave) === "KGM" && !Number.isNaN(cantidadUmt) ? cantidadUmt : null;
  return { sec, fraccion, subd, cantidad, umc, paisOrigen, pesoKg };
}

function isValuesLine(line: string): [number, number] | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length !== 3) return null;
  if (!/^-?\d+$/.test(tokens[0]) || !/^-?\d+$/.test(tokens[1])) return null;
  if (Number.isNaN(Number(tokens[2]))) return null;
  return [Number(tokens[0]), Number(tokens[1])];
}

function stripIgiSuffix(line: string): string {
  return line.replace(/\s+IGI\s+[\d.]+\s+\d+\s+\d+\s+\d+\s*$/, "");
}

const JUNK_PREFIXES = ["IDENTIFICADORES", "IDENTIF.", "OBSERVACIONES A NIVEL", "-- Relacion de", "DE: "];
const KNOWN_IDS = new Set(["CF", "EC", "EN", "ES", "EX", "MA", "XP", "ED"]);

function isJunkLine(line: string): boolean {
  if (JUNK_PREFIXES.some((p) => line.startsWith(p))) return true;
  const tokens = line.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && KNOWN_IDS.has(tokens[0]);
}

// "ED" identificadores only ever appear at nivel G (pedimento header), never
// per-partida, so a single whole-document scan (rather than the per-partida
// windowing isJunkLine relies on for NM) is enough to collect them all.
function extractIdentificadoresDocAduanero(cleanText: string): string[] {
  const values: string[] = [];
  for (const line of cleanText.split("\n")) {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens[0] === "ED" && tokens[1]) values.push(tokens[1]);
  }
  return [...new Set(values)];
}

function parseCuadroLiquidacion(fullText: string): {
  dta: number | null;
  igi: number | null;
  prv: number | null;
} {
  const result: { dta: number | null; igi: number | null; prv: number | null } = {
    dta: null,
    igi: null,
    prv: null,
  };
  for (const key of ["dta", "igi", "prv"] as const) {
    const re = new RegExp(`^${key.toUpperCase()}\\s+\\d+\\s+(\\d+)`, "im");
    const m = fullText.match(re);
    if (m) result[key] = parseInt(m[1], 10);
  }
  return result;
}

export async function parsePedimento(pdfPath: string): Promise<ParsedPedimento> {
  const pages = await extractPages(pdfPath);

  let fullText = "";
  let cleanText = "";
  pages.forEach((page, i) => {
    if (!page) return;
    // pdftotext -layout preserves each line's leading column-alignment
    // whitespace, which pdfplumber's word-based extraction didn't produce.
    // Left-trim so line-start-anchored regexes (e.g. parseCuadroLiquidacion's
    // `^DTA`) match the way they did against the old extractor's output.
    fullText += page.split("\n").map((l) => l.replace(/^[ \t]+/, "")).join("\n") + "\n";
    cleanText += cleanPage(page, i === 0) + "\n";
  });

  const headerInfo = extractHeaderInfo(fullText);
  const liquidacion = parseCuadroLiquidacion(fullText);

  const lines = cleanText.split("\n");
  const partidas: Partida[] = [];
  let i = 0;

  while (i < lines.length) {
    const header = isPartidaHeader(lines[i]);
    if (!header) {
      i++;
      continue;
    }

    i++;
    const descParts: string[] = [];
    let valAduana: number | null = null;
    let valComercial: number | null = null;

    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i++;
        continue;
      }

      const vals = isValuesLine(line);
      if (vals) {
        [valAduana, valComercial] = vals;
        i++;
        break;
      }

      if (isPartidaHeader(line)) break;

      if (isJunkLine(line)) {
        i++;
        continue;
      }

      descParts.push(stripIgiSuffix(line));
      i++;
    }

    // Scan forward through this partida's REGULACIONES Y RESTRICCIONES NO
    // ARANCELARIAS / IDENTIFICADORES block, up to the next partida header (or
    // end of pedimento), looking for a "NM <clave>" row. Its presence is what
    // determines whether this partida requires a NOM inspection dictamen —
    // a partida with no such row (e.g. a plain plastic lid, no labeling
    // requirement) doesn't need one.
    let nomClave: string | null = null;
    while (i < lines.length && !isPartidaHeader(lines[i])) {
      const tokens = lines[i].split(/\s+/).filter(Boolean);
      if (tokens[0] === "NM" && tokens.length > 1) {
        // Only the clave itself (e.g. "NOM-050-SCFI-2004") — further tokens
        // on this row are the permit number / firma descargo / etc. columns,
        // not part of the clave.
        nomClave = tokens[1];
      }
      i++;
    }

    const rawDescripcion = descParts.join(" ").trim();
    const marcaMatch = rawDescripcion.match(/^(.*?)\s*MARCA:\s*(.+)$/i);
    const descripcion = marcaMatch ? marcaMatch[1].trim() : rawDescripcion;
    const marca = marcaMatch ? marcaMatch[2].trim() : null;

    if (valAduana !== null && valComercial !== null) {
      const precioUnitario = Math.round((valAduana / header.cantidad) * 1e5) / 1e5;
      partidas.push({
        sec: header.sec,
        fraccion: header.fraccion,
        subd: header.subd,
        descripcion,
        marca,
        paisOrigen: header.paisOrigen,
        nomClave,
        cantidad: header.cantidad,
        valAduana,
        valComercial,
        precioUnitario,
        tieneIncrementables: valAduana !== valComercial,
        umc: header.umc,
        pesoKg: header.pesoKg,
      });
    }
  }

  return {
    ...headerInfo,
    dta: liquidacion.dta,
    igi: liquidacion.igi,
    prv: liquidacion.prv,
    identificadoresDocAduanero: extractIdentificadoresDocAduanero(cleanText),
    partidas,
  };
}

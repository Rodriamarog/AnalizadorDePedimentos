import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface Partida {
  sec: number;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  valAduana: number;
  valComercial: number;
  precioUnitario: number;
  tieneIncrementables: boolean;
  umc: string | null;
}

export interface ParsedPedimento {
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
  dta: number | null;
  igi: number | null;
  prv: number | null;
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

function extractHeaderInfo(fullText: string): {
  pedimentoNum: string;
  importador: string;
  tipoCambio: number;
} {
  let pedimentoNum = "";
  let importador = "";
  let tipoCambio = 0;

  let m = fullText.match(/NUM\. PEDIMENTO:\s*(.+?)\s*T\. OPER/);
  if (m) pedimentoNum = m[1].trim();

  m = fullText.match(/RAZON SOCIAL:\s*\n(.+)/);
  if (m) importador = m[1].trim();

  m = fullText.match(/TIPO CAMBIO:\s*([\d.,]+)/);
  if (m) tipoCambio = parseFloat(m[1].replace(/,/g, ""));

  return { pedimentoNum, importador, tipoCambio };
}

interface PartidaHeader {
  sec: number;
  fraccion: string;
  cantidad: number;
  umc: string | null;
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
  return { sec, fraccion, cantidad, umc };
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

  const { pedimentoNum, importador, tipoCambio } = extractHeaderInfo(fullText);
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

    const descripcion = descParts.join(" ").trim();
    if (valAduana !== null && valComercial !== null) {
      const precioUnitario = Math.round((valAduana / header.cantidad) * 1e5) / 1e5;
      partidas.push({
        sec: header.sec,
        fraccion: header.fraccion,
        descripcion,
        cantidad: header.cantidad,
        valAduana,
        valComercial,
        precioUnitario,
        tieneIncrementables: valAduana !== valComercial,
        umc: header.umc,
      });
    }
  }

  return {
    pedimentoNum,
    importador,
    tipoCambio,
    dta: liquidacion.dta,
    igi: liquidacion.igi,
    prv: liquidacion.prv,
    partidas,
  };
}

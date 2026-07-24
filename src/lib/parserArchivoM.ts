import type { ParsedPedimento, Partida } from "@/lib/parser";

// Parses the pipe-delimited "archivo M" export (record types 500-999) that
// some customs-broker software (e.g. Vantec DARWIN) produces alongside the
// printed pedimento PDF. Field positions below were reverse-engineered from
// a sample export cross-checked against parser.ts's PDF-derived field
// meanings — there's no official published layout for this specific text
// format, unlike the PDF's own printed labels.
//
// dta/igi/prv come from the 510 "cuadro de liquidación" lines, which key
// each contribution amount by the numeric clave de contribución from Anexo
// 22 Apéndice 12 (not the DTA/IGI/PRV text labels the PDF prints): 1 = DTA,
// 6 = IGI/IGE, 15 = PRV. Clave 23 ("IVA/PRV", the IVA prevalidación fee) is
// a distinct concept from clave 15's PRV and has no field on
// ParsedPedimento, so it's ignored. `regimen` is left null — no regimen
// clave appears anywhere in this record layout.
const CONTRIBUCION_CLAVE: Record<string, "dta" | "igi" | "prv"> = {
  "1": "dta",
  "6": "igi",
  "15": "prv",
};

function toIsoDateDDMMYYYY(date: string | undefined): string | null {
  if (!date) return null;
  const m = date.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

interface PartidaAccum {
  sec: number;
  fraccion: string;
  subd: string | null;
  descripcionRaw: string;
  cantidad: number;
  valAduana: number;
  valComercial: number;
  umc: string | null;
  paisOrigen: string | null;
  nomClave: string | null;
  marcaFromIdentificador: string | null;
}

export function parseArchivoM(text: string): ParsedPedimento {
  const lines = text.split(/\r?\n/);

  let correlativo = "";
  let patente = "";
  let claveAduana: string | null = null;
  let tipoCambio = 0;
  let rfc: string | null = null;
  let importador = "";
  let domicilioFiscal: string | null = null;
  let facturaNumero: string | null = null;
  let fechaEntrada: string | null = null;
  let fechaPago: string | null = null;
  let dta: number | null = null;
  let igi: number | null = null;
  let prv: number | null = null;

  const partidaOrder: number[] = [];
  const partidaBySec = new Map<number, PartidaAccum>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const f = line.split("|");
    const tipo = f[0];

    switch (tipo) {
      case "500": {
        patente = f[2] ?? "";
        correlativo = f[3] ?? "";
        claveAduana = f[4] || null;
        break;
      }
      case "501": {
        rfc = f[7] || null;
        tipoCambio = parseFloat(f[10]) || 0;
        importador = (f[21] ?? "").trim();
        const domicilioParts = [f[22], f[23], f[24], f[25], f[26], f[27], f[28]]
          .map((p) => (p ?? "").trim())
          .filter(Boolean);
        domicilioFiscal = domicilioParts.length > 0 ? domicilioParts.join(" ") : null;
        break;
      }
      case "505": {
        facturaNumero = f[3] || null;
        break;
      }
      case "506": {
        const seq = f[2];
        const iso = toIsoDateDDMMYYYY(f[3]);
        if (seq === "1") fechaEntrada = iso;
        else if (seq === "2") fechaPago = iso;
        break;
      }
      case "510": {
        const claveContribucion = f[2] ?? "";
        const importe = Number(f[4]);
        const field = CONTRIBUCION_CLAVE[claveContribucion];
        if (field && !Number.isNaN(importe)) {
          if (field === "dta") dta = importe;
          else if (field === "igi") igi = importe;
          else prv = importe;
        }
        break;
      }
      case "551": {
        const fraccion = f[2] ?? "";
        const sec = parseInt(f[3], 10);
        if (Number.isNaN(sec)) break;
        const subd = f[4] || null;
        const descripcionRaw = (f[5] ?? "").trim();
        const valAduana = Number(f[7]);
        const valComercial = Number(f[8]);
        const cantidad = Number(f[10]);
        const umc = f[11] || null;
        const paisOrigen = f[20] || null;
        if (Number.isNaN(valAduana) || Number.isNaN(valComercial) || Number.isNaN(cantidad)) break;
        partidaOrder.push(sec);
        partidaBySec.set(sec, {
          sec,
          fraccion,
          subd,
          descripcionRaw,
          cantidad,
          valAduana,
          valComercial,
          umc,
          paisOrigen,
          nomClave: null,
          marcaFromIdentificador: null,
        });
        break;
      }
      case "553": {
        const sec = parseInt(f[3], 10);
        const p = partidaBySec.get(sec);
        if (p && f[4] === "NM" && f[6]) p.nomClave = f[6];
        break;
      }
      case "554": {
        const sec = parseInt(f[3], 10);
        const p = partidaBySec.get(sec);
        if (p && f[4] === "MA" && f[5]) p.marcaFromIdentificador = f[5].trim();
        break;
      }
      default:
        break;
    }
  }

  const partidas: Partida[] = partidaOrder.map((sec) => {
    const p = partidaBySec.get(sec)!;
    const marcaMatch = p.descripcionRaw.match(/^(.*?)\s*MARCA:\s*(.+)$/i);
    const descripcion = marcaMatch ? marcaMatch[1].trim() : p.descripcionRaw;
    const marca = marcaMatch ? marcaMatch[2].trim() : p.marcaFromIdentificador;
    const precioUnitario = p.cantidad !== 0 ? Math.round((p.valAduana / p.cantidad) * 1e5) / 1e5 : 0;
    return {
      sec: p.sec,
      fraccion: p.fraccion,
      subd: p.subd,
      descripcion,
      marca,
      paisOrigen: p.paisOrigen,
      nomClave: p.nomClave,
      cantidad: p.cantidad,
      valAduana: p.valAduana,
      valComercial: p.valComercial,
      precioUnitario,
      tieneIncrementables: p.valAduana !== p.valComercial,
      umc: p.umc,
    };
  });

  // The correlativo alone (e.g. "6000587") isn't the full 15-digit pedimento
  // number the rest of the app expects (año + aduana + patente + folio);
  // reconstruct it the same way the printed pedimento's "NUM. PEDIMENTO"
  // does, using the year from fechaPago/fechaEntrada.
  const yearSource = fechaPago ?? fechaEntrada;
  const yy = yearSource ? yearSource.slice(2, 4) : String(new Date().getFullYear()).slice(2, 4);
  const aduana2 = (claveAduana ?? "").slice(0, 2).padStart(2, "0");
  const patente4 = patente.padStart(4, "0");
  const folio7 = correlativo.padStart(7, "0");
  const pedimentoNum = `${yy}${aduana2}${patente4}${folio7}`;

  return {
    pedimentoNum,
    importador,
    tipoCambio,
    dta,
    igi,
    prv,
    rfc,
    domicilioFiscal,
    regimen: null,
    facturaNumero,
    fechaPedimento: fechaPago ?? fechaEntrada,
    fechaEntrada,
    fechaPago,
    claveAduana,
    partidas,
  };
}

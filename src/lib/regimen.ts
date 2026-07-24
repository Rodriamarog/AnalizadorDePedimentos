// Pedimento "régimen aduanero" code -> full name (SAT c_Regimen catalog).
// Small fixed catalog, mapped deterministically without AI — same approach
// as umc.ts/paisOrigen.ts. Unknown codes fall back to the raw code.
const REGIMEN_TO_NAME: Record<string, string> = {
  IMD: "IMPORTACION DEFINITIVA",
  IMT: "IMPORTACION TEMPORAL",
  EXD: "EXPORTACION DEFINITIVA",
  EXT: "EXPORTACION TEMPORAL",
  ITR: "TRANSITO INTERNO",
  TRA: "TRANSITO INTERNACIONAL",
  DFI: "DEPOSITO FISCAL",
  ELA: "ELABORACION, TRANSFORMACION O REPARACION EN RECINTO FISCALIZADO",
  RFE: "RECINTO FISCALIZADO ESTRATEGICO",
};

export function regimenToName(code: string | null | undefined): string {
  if (!code) return "";
  return REGIMEN_TO_NAME[code.toUpperCase()] ?? code;
}

// The "archivo M" export has no dedicated régimen field/clave anywhere in its
// record layout, but the boilerplate legal citation in its free-text
// observaciones (record 511) always opens by spelling out the régimen name
// itself (e.g. "IMPORTACION DEFINITIVA DE CONFORMIDAD CON EL ART. 96 DE LA
// LEY ADUANERA..."), same wording as this catalog's names. Reverse-look it up
// from there instead of leaving `regimen` null.
export function regimenCodeFromText(text: string): string | null {
  const entry = Object.entries(REGIMEN_TO_NAME)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, name]) => text.includes(name));
  return entry ? entry[0] : null;
}

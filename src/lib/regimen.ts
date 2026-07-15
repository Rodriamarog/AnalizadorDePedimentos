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

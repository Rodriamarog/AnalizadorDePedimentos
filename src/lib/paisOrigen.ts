// Pedimento "país de origen/destino" (P.O/D) code -> full name. Customs
// prints SAT's c_Pais catalog code (mostly ISO 3166-1 alpha-3, with a couple
// of SAT-specific exceptions), so — like UMC — it's a small fixed catalog
// that can be mapped deterministically without AI. Only the countries this
// org has actually imported from are listed; unknown codes fall back to the
// raw code so a new trading partner never silently produces a blank field.
const PAIS_TO_NAME: Record<string, string> = {
  CHN: "CHINA",
  USA: "ESTADOS UNIDOS DE AMERICA",
  MEX: "MEXICO",
  DEU: "ALEMANIA",
  JPN: "JAPON",
  KOR: "COREA DEL SUR",
  TWN: "TAIWAN",
  VNM: "VIETNAM",
  IND: "INDIA",
  ITA: "ITALIA",
  ESP: "ESPAÑA",
  FRA: "FRANCIA",
  GBR: "REINO UNIDO",
  CAN: "CANADA",
  BRA: "BRASIL",
  HKG: "HONG KONG",
};

export function paisToName(code: string | null | undefined): string {
  if (!code) return "";
  return PAIS_TO_NAME[code.toUpperCase()] ?? code;
}

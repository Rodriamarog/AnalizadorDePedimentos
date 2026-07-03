// Pedimento "unidad de medida comercial" (UMC) code -> SAT c_ClaveUnidad.
// UMC is the numeric unit code customs prints on the pedimento PDF; it is a
// small fixed catalog distinct from SAT's CFDI unit catalog, so it can be
// mapped deterministically without AI.
const UMC_TO_UNIT_KEY: Record<string, string> = {
  "1": "KGM",
  "2": "GRM",
  "3": "MTR",
  "4": "MTK",
  "5": "MTQ",
  "6": "H87",
  "7": "H87",
  "8": "LTR",
  "9": "PR",
  "10": "KWT",
  "11": "MIL",
  "12": "SET",
  "13": "KWH",
  "14": "TNE",
  "15": "BRL",
  "16": "GRM",
  "17": "C62",
  "18": "CEN",
  "19": "DZN",
  "20": "XBX",
  "21": "XBO",
  "99": "H87",
};

export function umcToUnitKey(umc: string | null | undefined): string {
  return UMC_TO_UNIT_KEY[umc ?? ""] ?? "H87";
}

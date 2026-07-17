// SAT's Aduana-Sección catalog (RGCE, Anexo 22 Apéndice 1) — 2-digit clave ->
// official name (the "Sección 0" / main-office denomination for each
// aduana). Verified against the official catalog text, effective 2026-02-02
// per DOF 15/01/2026 (see docs/catalogo-aduanas.txt for the full source and
// per-aduana citation). The pedimento's own "ADUANA E/S" / "CLAVE DE LA
// SECCION ADUANERA DE DESPACHO" field is 3 digits (aduana + sección); the
// first two digits are this clave.
export const ADUANAS: Record<string, string> = {
  "01": "Acapulco, Guerrero",
  "02": "Agua Prieta, Sonora",
  "05": "Subteniente López, Quintana Roo",
  "06": "Ciudad del Carmen, Campeche",
  "07": "Ciudad Juárez, Chihuahua",
  "08": "Coatzacoalcos, Veracruz",
  "11": "Ensenada, Baja California",
  "12": "Guaymas, Sonora",
  "14": "La Paz, Baja California Sur",
  "16": "Manzanillo, Colima",
  "17": "Matamoros, Tamaulipas",
  "18": "Mazatlán, Sinaloa",
  "19": "Mexicali, Baja California",
  "20": "México, Ciudad de México",
  "22": "Naco, Sonora",
  "23": "Nogales, Sonora",
  "24": "Nuevo Laredo, Tamaulipas",
  "25": "Ojinaga, Chihuahua",
  "26": "Puerto Palomas, Chihuahua",
  "27": "Piedras Negras, Coahuila de Zaragoza",
  "28": "Progreso, Yucatán",
  "30": "Ciudad Reynosa, Tamaulipas",
  "31": "Salina Cruz, Oaxaca",
  "33": "San Luis Río Colorado, Sonora",
  "34": "Ciudad Miguel Alemán, Tamaulipas",
  "37": "Ciudad Hidalgo, Chiapas",
  "38": "Tampico, Tamaulipas",
  "39": "Tecate, Baja California",
  "40": "Tijuana, Baja California",
  "42": "Tuxpan, Veracruz",
  "43": "Veracruz, Veracruz",
  "44": "Ciudad Acuña, Coahuila de Zaragoza",
  "46": "Torreón, Coahuila de Zaragoza",
  "47": "Aeropuerto Internacional de la Ciudad de México",
  "48": "Guadalajara, Jalisco",
  "50": "Sonoyta, Sonora",
  "51": "Lázaro Cárdenas, Michoacán",
  "52": "Monterrey, Nuevo León",
  "53": "Cancún, Quintana Roo",
  "64": "Querétaro, Querétaro",
  "65": "Toluca, Estado de México",
  "67": "Chihuahua, Chihuahua",
  "73": "Aguascalientes, Aguascalientes",
  "75": "Puebla, Puebla",
  "80": "Colombia, Nuevo León",
  "81": "Altamira, Tamaulipas",
  "82": "Ciudad Camargo, Tamaulipas",
  "83": "Dos Bocas, Tabasco",
  "84": "Guanajuato, Guanajuato",
  "85": "Aeropuerto Internacional Felipe Ángeles, Estado de México",
};

// The pedimento prints a 3-digit "ADUANA E/S" (aduana + sección); the
// c_Aduana clave is just the first two digits.
export function aduanaName(claveAduana: string | null | undefined): string | null {
  if (!claveAduana) return null;
  const clave2 = claveAduana.trim().slice(0, 2);
  return ADUANAS[clave2] ?? null;
}

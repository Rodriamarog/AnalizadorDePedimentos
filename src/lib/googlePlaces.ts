// Wraps Google's Places API (New) — Autocomplete and Place Details — to power
// the Google-verified dirección search (issue #19). Server-side only — the
// API key must never reach the client (see src/app/api/places/*/route.ts).

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

export class PlacesApiError extends Error {}

export async function fetchAutocompleteSuggestions(
  input: string,
  sessionToken: string,
  apiKey: string
): Promise<PlaceSuggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["mx"],
      languageCode: "es",
    }),
  });

  if (!res.ok) throw new PlacesApiError(`Google Places Autocomplete respondió con error (${res.status})`);

  const data = await res.json();
  const suggestions = (data.suggestions ?? []) as Array<{
    placePrediction?: { placeId: string; text?: { text: string } };
  }>;

  return suggestions
    .filter((s) => s.placePrediction)
    .map((s) => ({
      placeId: s.placePrediction!.placeId,
      text: s.placePrediction!.text?.text ?? "",
    }));
}

export interface ResolvedPlace {
  placeId: string;
  formattedAddress: string;
  calle: string;
  numeroExterior: string;
  colonia: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  pais: string;
}

interface AddressComponent {
  longText: string;
  shortText: string;
  // Optional: Google omits this entirely on some components (seen on a
  // premise/complex-name component preceding the route, e.g. "Blvd. Los
  // Olivos" ahead of "Parque Industria" — no `types` key in the API
  // response at all, not just an empty array).
  types?: string[];
}

// Google's country component is ISO 3166-1 alpha-2 (e.g. "MX"), but every
// other país field in this codebase — form defaults, CartaPorteDomicilio.Pais,
// SAT's c_Pais catalog (see paisOrigen.ts) — is alpha-3 ("MEX"). Autocomplete
// is region-restricted to Mexico, so MX covers the overwhelming majority of
// results; a short list of Mexico's usual Carta Porte trading partners covers
// the rest. An unmapped code is left blank so the caller's `a.pais || existing`
// fallback keeps whatever alpha-3 value was already in the field, rather than
// writing an alpha-2 code SAT would reject.
const ALPHA2_TO_SAT_ALPHA3: Record<string, string> = {
  MX: "MEX",
  US: "USA",
  CA: "CAN",
  GT: "GTM",
  BZ: "BLZ",
};

// Google's Mexican address components don't map 1:1 onto SAT's Calle/Colonia/
// Municipio split — this is a best-effort mapping, not a guarantee (see the
// "soft requirement" note in issue #19). sublocality covers most colonias;
// locality covers most municipios, falling back to administrative_area_level_2
// for places where Google only assigns the latter.
function mapAddressComponents(components: AddressComponent[]): Omit<ResolvedPlace, "placeId" | "formattedAddress"> {
  const find = (type: string) => components.find((c) => c.types?.includes(type));

  const streetNumber = find("street_number")?.longText ?? "";
  const route = find("route")?.longText ?? "";
  const colonia = find("sublocality") ?? find("sublocality_level_1") ?? find("neighborhood");
  const municipio = find("locality") ?? find("administrative_area_level_2");
  const estado = find("administrative_area_level_1");
  const codigoPostal = find("postal_code");
  const pais = find("country");

  return {
    calle: route,
    numeroExterior: streetNumber,
    colonia: colonia?.longText ?? "",
    municipio: municipio?.longText ?? "",
    estado: estado?.shortText ?? estado?.longText ?? "",
    codigoPostal: codigoPostal?.longText ?? "",
    pais: (pais?.shortText && ALPHA2_TO_SAT_ALPHA3[pais.shortText]) ?? "",
  };
}

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken: string,
  apiKey: string
): Promise<ResolvedPlace> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sessionToken);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents",
    },
  });

  if (!res.ok) throw new PlacesApiError(`Google Places Details respondió con error (${res.status})`);

  const data = await res.json();
  const components = (data.addressComponents ?? []) as AddressComponent[];

  return {
    placeId: data.id ?? placeId,
    formattedAddress: data.formattedAddress ?? "",
    ...mapAddressComponents(components),
  };
}

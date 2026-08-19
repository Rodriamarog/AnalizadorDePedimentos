// Wraps Google's Distance Matrix API (https://maps.googleapis.com/maps/api/distancematrix/json)
// to auto-calculate the Carta Porte "Distancia recorrida" field. Server-side only — the API key
// must never reach the client (see src/app/api/carta-porte/distance/route.ts).

export interface AddressQueryInput {
  calle?: string;
  numeroExterior?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  codigoPostal?: string;
  pais?: string;
}

// Pure (no fetch), exercisable directly with a fixture domicilio.
export function buildAddressQuery(a: AddressQueryInput): string {
  const calleConNumero = [a.calle, a.numeroExterior].filter((p) => p?.trim()).join(" ");
  return [calleConNumero, a.colonia, a.municipio, a.estado, a.codigoPostal, a.pais]
    .filter((p) => p && p.trim())
    .join(", ");
}

export class DistanceMatrixError extends Error {}

// Returns driving distance in whole km between the two address queries, or throws
// DistanceMatrixError with a Spanish message suitable for surfacing directly to the user.
export async function fetchDrivingDistanceKm(
  origenQuery: string,
  destinoQuery: string,
  apiKey: string
): Promise<number> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origenQuery);
  url.searchParams.set("destinations", destinoQuery);
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new DistanceMatrixError(`Google Distance Matrix respondió con error (${res.status})`);

  const data = await res.json();
  if (data.status !== "OK") {
    throw new DistanceMatrixError(
      data.status === "REQUEST_DENIED"
        ? "La API de Google Maps rechazó la solicitud (revisa la API key)"
        : `Google Distance Matrix: ${data.status}`
    );
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    const status = element?.status;
    throw new DistanceMatrixError(
      status === "NOT_FOUND"
        ? "No se pudo ubicar el origen o el destino — revisa las direcciones"
        : status === "ZERO_RESULTS"
          ? "No se encontró una ruta en automóvil entre el origen y el destino"
          : "No se pudo calcular la distancia"
    );
  }

  const meters = element.distance?.value;
  if (typeof meters !== "number") throw new DistanceMatrixError("La respuesta de Google no incluyó la distancia");

  return Math.round(meters / 1000);
}

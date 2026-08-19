import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { buildAddressQuery, fetchDrivingDistanceKm, DistanceMatrixError, type AddressQueryInput } from "@/lib/googleDistance";

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY no está configurada en el servidor" }, { status: 500 });
  }

  const body = await req.json();
  // Issue #20: a verified (has a place_id) side queries Google by
  // `place_id:<id>` — more reliable than hoping a re-assembled address
  // string geocodes to the same place twice. The other side, if unverified,
  // still falls back to the text-join method.
  const origenPlaceId = typeof body?.origen?.placeId === "string" ? body.origen.placeId : null;
  const destinoPlaceId = typeof body?.destino?.placeId === "string" ? body.destino.placeId : null;
  const origenQuery = origenPlaceId
    ? `place_id:${origenPlaceId}`
    : buildAddressQuery((body?.origen ?? {}) as AddressQueryInput);
  const destinoQuery = destinoPlaceId
    ? `place_id:${destinoPlaceId}`
    : buildAddressQuery((body?.destino ?? {}) as AddressQueryInput);
  if (!origenQuery || !destinoQuery) {
    return NextResponse.json(
      { error: "Completa el domicilio de origen y destino antes de calcular la distancia" },
      { status: 400 }
    );
  }

  try {
    const distanciaKm = await fetchDrivingDistanceKm(origenQuery, destinoQuery, apiKey);
    return NextResponse.json({ distanciaKm });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof DistanceMatrixError ? e.message : "Error al calcular la distancia" },
      { status: 502 }
    );
  }
}

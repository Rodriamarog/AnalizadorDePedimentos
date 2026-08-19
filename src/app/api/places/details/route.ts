import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { fetchPlaceDetails, PlacesApiError } from "@/lib/googlePlaces";

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY no está configurada en el servidor" }, { status: 500 });
  }

  const body = await req.json();
  const placeId = typeof body?.placeId === "string" ? body.placeId : "";
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
  if (!placeId || !sessionToken) {
    return NextResponse.json({ error: "placeId y sessionToken son requeridos" }, { status: 400 });
  }

  try {
    const place = await fetchPlaceDetails(placeId, sessionToken, apiKey);
    return NextResponse.json(place);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof PlacesApiError ? e.message : "Error al resolver la dirección" },
      { status: 502 }
    );
  }
}

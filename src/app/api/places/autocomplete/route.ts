import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { fetchAutocompleteSuggestions, PlacesApiError } from "@/lib/googlePlaces";

export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY no está configurada en el servidor" }, { status: 500 });
  }

  const body = await req.json();
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
  if (!input || !sessionToken) {
    return NextResponse.json({ error: "input y sessionToken son requeridos" }, { status: 400 });
  }

  try {
    const suggestions = await fetchAutocompleteSuggestions(input, sessionToken, apiKey);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof PlacesApiError ? e.message : "Error al buscar direcciones" },
      { status: 502 }
    );
  }
}

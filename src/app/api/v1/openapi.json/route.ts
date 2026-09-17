import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/lib/v1/openapi";
import { openapiTranslationsEs } from "@/lib/v1/openapiTranslationsEs";
import { translateDocument } from "@/lib/v1/translateOpenApiDocument";
import "@/lib/v1/registerRoutes";

export function GET() {
  return NextResponse.json(translateDocument(generateOpenApiDocument(), openapiTranslationsEs));
}

import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/lib/v1/openapi";
import "@/lib/v1/registerRoutes";

export function GET() {
  return NextResponse.json(generateOpenApiDocument());
}

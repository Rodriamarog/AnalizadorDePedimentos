import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/lib/v1/openapi";
// Side-effect imports: each route file calls registry.registerPath() at
// module load, so the routes below must be imported before generating the
// document or they simply won't be in it.
import "@/app/api/v1/catalogs/unidades/route";
import "@/app/api/v1/catalogs/claves-prod-serv/route";
import "@/app/api/v1/pedimentos/route";
import "@/app/api/v1/pedimentos/[id]/route";
import "@/app/api/v1/jobs/[job_id]/route";
import "@/app/api/v1/facturas/route";
import "@/app/api/v1/facturas/[id]/route";
import "@/app/api/v1/facturas/[id]/stamp/route";
import "@/app/api/v1/facturas/[id]/pdf/route";
import "@/app/api/v1/facturas/[id]/xml/route";
import "@/app/api/v1/vehiculos/route";
import "@/app/api/v1/vehiculos/[id]/route";
import "@/app/api/v1/choferes/route";
import "@/app/api/v1/choferes/[id]/route";
import "@/app/api/v1/direcciones/route";
import "@/app/api/v1/direcciones/[id]/route";

export function GET() {
  return NextResponse.json(generateOpenApiDocument());
}

// Side-effect imports: each route file calls registry.registerPath() at
// module load, so these must run before generateOpenApiDocument() or the
// routes simply won't be in the generated document. Shared by both
// openapi.json/route.ts (Spanish) and openapi.en.json/route.ts (English) so
// the list only needs to be kept in sync in one place.
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
import "@/app/api/v1/cartas-porte/route";
import "@/app/api/v1/vehiculos/route";
import "@/app/api/v1/vehiculos/[id]/route";
import "@/app/api/v1/choferes/route";
import "@/app/api/v1/choferes/[id]/route";
import "@/app/api/v1/direcciones/route";
import "@/app/api/v1/direcciones/[id]/route";
import "@/app/api/v1/clientes/route";
import "@/app/api/v1/clientes/[id]/route";
import "@/app/api/v1/productos/route";
import "@/app/api/v1/productos/[id]/route";
import "@/app/api/v1/csd/route";
import "@/app/api/v1/admin/organizations/route";
import "@/app/api/v1/webhooks/route";
import "@/app/api/v1/webhooks/[id]/route";

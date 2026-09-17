import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { umcToUnitKey } from "@/lib/umc";
import { productosByFraccion } from "@/lib/v1/productosLookup";

const partidaResponseSchema = z.object({
  sec: z.number(),
  fraccion: z.string(),
  subd: z.string().nullable(),
  descripcion: z.string(),
  marca: z.string().nullable(),
  pais_origen: z.string().nullable(),
  nom_clave: z.string().nullable(),
  cantidad: z.number(),
  val_aduana: z.number(),
  val_comercial: z.number(),
  precio_unitario: z.number(),
  tiene_incrementables: z.boolean(),
  umc: z.string().nullable(),
  tipo_cambio: z.number().nullable(),
  peso_kg: z.number().nullable(),
  // SAT codes resolved for this partida (#60): clave_prod_serv is `null`
  // with `clave_prod_serv_mapped: false` when the fracción has no entry yet
  // in the org's `productos` table — an explicit "not mapped" signal, not
  // just an ambiguous bare null (which could otherwise mean "mapped to
  // nothing" or "not looked up at all").
  clave_prod_serv: z.string().nullable(),
  clave_prod_serv_description: z.string().nullable(),
  clave_prod_serv_confidence: z.string().nullable(),
  clave_prod_serv_mapped: z.boolean(),
  // Always present, via the deterministic umc -> c_ClaveUnidad lookup
  // (src/lib/umc.ts) — unlike clave_prod_serv this never needs AI and has a
  // safe default fallback, so there's no "unmapped" state to signal.
  clave_unidad: z.string(),
});

const pedimentoResponseSchema = z.object({
  pedimento_id: z.string(),
  pedimento_num: z.string(),
  importador: z.string(),
  tipo_cambio: z.number(),
  source_filename: z.string(),
  fecha_upload: z.string(),
  dta: z.number().nullable(),
  igi: z.number().nullable(),
  prv: z.number().nullable(),
  rfc: z.string().nullable(),
  domicilio_fiscal: z.string().nullable(),
  regimen: z.string().nullable(),
  cve_pedimento: z.string().nullable(),
  factura_numero: z.string().nullable(),
  fecha_pedimento: z.string().nullable(),
  fecha_entrada: z.string().nullable(),
  fecha_pago: z.string().nullable(),
  clave_aduana: z.string().nullable(),
  peso_bruto: z.number().nullable(),
  identificadores_doc_aduanero: z.array(z.string()),
  partidas: z.array(partidaResponseSchema),
});

registry.registerPath({
  method: "get",
  path: "/pedimentos/{id}",
  summary: "Retrieve a parsed pedimento, full field parity with the internal record",
  tags: ["pedimentos"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "The pedimento and its partidas.",
      content: { "application/json": { schema: pedimentoResponseSchema } },
    },
    404: {
      description: "No pedimento with that id for this org.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const result = await withOrg(auth.orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, id)).limit(1);
    if (!pedimento) return null;
    const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, id)).orderBy(asc(partidas.sec));

    const productoRows = await productosByFraccion(tx, auth.orgId, rows.map((p) => p.fraccion));
    const productoByFraccion = new Map(productoRows.map((p) => [p.fraccion, p]));

    return { pedimento, rows, productoByFraccion };
  });

  if (!result) {
    return apiError(404, "not_found", "No pedimento with that id");
  }
  const { pedimento, rows, productoByFraccion } = result;

  return NextResponse.json({
    pedimento_id: pedimento.id,
    pedimento_num: pedimento.pedimentoNum,
    importador: pedimento.importador,
    tipo_cambio: pedimento.tipoCambio,
    source_filename: pedimento.pdfFilename,
    fecha_upload: pedimento.fechaUpload.toISOString(),
    dta: pedimento.dta,
    igi: pedimento.igi,
    prv: pedimento.prv,
    rfc: pedimento.rfc,
    domicilio_fiscal: pedimento.domicilioFiscal,
    regimen: pedimento.regimen,
    cve_pedimento: pedimento.cvePedimento,
    factura_numero: pedimento.facturaNumero,
    fecha_pedimento: pedimento.fechaPedimento,
    fecha_entrada: pedimento.fechaEntrada,
    fecha_pago: pedimento.fechaPago,
    clave_aduana: pedimento.claveAduana,
    peso_bruto: pedimento.pesoBruto,
    identificadores_doc_aduanero: pedimento.identificadoresDocAduanero,
    partidas: rows.map((p) => {
      const producto = productoByFraccion.get(p.fraccion);
      return {
        sec: p.sec,
        fraccion: p.fraccion,
        subd: p.subd,
        descripcion: p.descripcion,
        marca: p.marca,
        pais_origen: p.paisOrigen,
        nom_clave: p.nomClave,
        cantidad: p.cantidad,
        val_aduana: p.valAduana,
        val_comercial: p.valComercial,
        precio_unitario: p.precioUnitario,
        tiene_incrementables: p.tieneIncrementables,
        umc: p.umc,
        tipo_cambio: p.tipoCambio,
        peso_kg: p.pesoKg,
        clave_prod_serv: producto?.claveProdServ ?? null,
        clave_prod_serv_description: producto?.descripcionSat ?? null,
        clave_prod_serv_confidence: producto?.confidence ?? null,
        clave_prod_serv_mapped: !!producto?.claveProdServ,
        clave_unidad: umcToUnitKey(p.umc),
      };
    }),
  });
}

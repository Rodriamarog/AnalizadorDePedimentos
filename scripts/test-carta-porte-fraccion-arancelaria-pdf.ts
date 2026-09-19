// One-off verification of #80: mapPedimentoToMercancias now carries each
// partida's fraccion+subd onto its mercancía as a 10-digit FraccionArancelaria
// (buildFraccionArancelaria in buildCartaPorte.ts). Builds a real Carta
// Porte complement straight from that function (no DB/API layer — this
// isolates the fix from the unrelated, pre-existing gap where the v1
// public API's /cartas-porte route never exposes an `internacional` toggle,
// which independently blocks pedimento-sourced stamping through that route),
// stamps it with the real FacturAPI sandbox, and downloads the resulting
// PDF so a human/agent can visually confirm FraccionArancelaria actually
// renders per mercancía — the same way DocumentacionAduanera/NumPedimento
// was already confirmed to render.
//
// Run with: tsx --env-file=.env.local scripts/test-carta-porte-fraccion-arancelaria-pdf.ts
import { writeFile } from "node:fs/promises";
import { createFacturapiClient } from "../src/lib/facturapi";
import { buildCartaPorteComplement, mapPedimentoToMercancias, type PedimentoForCartaPorte } from "../src/lib/buildCartaPorte";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");
  const client = createFacturapiClient(testKey);

  // Real fracción (8 digits, as partidas.fraccion always stores it) + its
  // real subd/NICO (as partidas.subd stores it) — both taken from the
  // actual parsed pedimento fixture (public/pedimentos/6000505 PAGADO.pdf,
  // partida 1). Concatenated: "7615100299", confirmed via FacturAPI's
  // GET /catalogs/comercioexterior/2.0/tariff-fractions?q=7615 to be a real
  // key in SAT's c_FraccionArancelaria catalog.
  const pedimento: PedimentoForCartaPorte = {
    pedimentoNum: "26 40 3362 6000505",
    rfc: "AARC700811CL4",
    identificadoresDocAduanero: [],
    pesoBruto: 5.26,
    partidas: [
      {
        fraccion: "76151002",
        subd: "99",
        descripcion: "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO",
        cantidad: 2,
        umc: "1",
        paisOrigen: "USA",
        pesoKg: 5.26,
      },
    ],
  };

  const { mercancias, pesoBrutoTotal } = mapPedimentoToMercancias(pedimento, [
    { fraccion: "76151002", bienesTransp: "24122004" },
  ]);
  assert(mercancias[0].fraccionArancelaria === "7615100299", `fraccionArancelaria is 10-digit (got ${mercancias[0].fraccionArancelaria})`);

  const complement = buildCartaPorteComplement({
    // Same real Tijuana addresses (CP/Estado/Municipio/Colonia combo) shown
    // on the earlier reference invoice PDF for this fixture pedimento —
    // SAT's c_CodigoPostal catalog validates the whole combo together, not
    // just a well-formed CP.
    ubicacionOrigen: {
      rfc: "AARC700811CL4",
      nombre: "RECOVERY SOLUTIONS DEMO",
      fechaHoraSalidaLlegada: "2026-01-15T08:00:00",
      domicilio: { Estado: "BCN", Pais: "MEX", CodigoPostal: "22504" },
    },
    ubicacionDestino: {
      rfc: "AARC700811CL4",
      nombre: "TOYOTA TIJUANA",
      fechaHoraSalidaLlegada: "2026-01-15T20:00:00",
      domicilio: { Estado: "BCN", Pais: "MEX", CodigoPostal: "22010" },
    },
    mercancias,
    pesoBrutoTotal: pesoBrutoTotal ?? 5.26,
    unidadPeso: "KGM",
    autotransporte: {
      permisoSct: "TPAF04",
      numeroPermisoSct: "1234",
      configVehicular: "C2",
      pesoBrutoVehicular: 10000,
      placa: "ABC123",
      anioModeloVehiculo: "2020",
      aseguradoraRespCivil: "Aseguradora Test",
      polizaRespCivil: "POL-123",
    },
    figurasTransporte: [{ tipoFigura: "01", nombreFigura: "Juan Perez", rfc: "AARC700811CL4", numeroLicencia: "LIC123" }],
    distanciaRecorridaKm: 18,
    // Deliberately domestic (TranspInternac="No") to isolate what's under
    // test — FraccionArancelaria — from this app's separate, pre-existing
    // gap in full international-transport SAT compliance (TipoMateria,
    // RegimenesAduaneros, etc. aren't modeled anywhere in buildCartaPorte.ts
    // yet). DocumentacionAduanera (which mapPedimentoToMercancias always
    // attaches) is SAT-illegal outside TranspInternac="Sí", so it's stripped
    // below — that field was already confirmed rendering correctly on a
    // real invoice earlier; FraccionArancelaria is the only new thing here.
  });
  delete complement.data.Mercancias.Mercancia[0].DocumentacionAduanera;

  const invoiceBody = {
    // "I" (Ingreso) — the Carta Porte Ingreso variant, which is the one the
    // real reference PDF used for this same fixture pedimento showed
    // "Tipo de CFDI: I". Traslado ("T") invoices reject priced/taxed items
    // and payment_form/payment_method outright, which isn't what's under
    // test here — Facturapi's PDF rendering of FraccionArancelaria is
    // identical regardless of invoice type.
    type: "I",
    customer: {
      legal_name: "EMPRESA DEMO",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "01234" },
      email: "test@example.com",
    },
    items: [
      {
        quantity: 1,
        product: {
          description: "Tarifa del Transportista",
          product_key: "78101800",
          price: 3000,
          unit_key: "E48",
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
        },
      },
    ],
    complements: [complement],
    payment_form: "03",
    payment_method: "PUE",
    use: "S01",
    currency: "MXN",
  };

  const inv = await client.post<{ id: string; status: string }>("invoices", invoiceBody);
  assert(inv.status === "valid", `invoice stamped (got status ${inv.status})`);
  console.log("Stamped invoice:", inv.id);

  const pdfRes = await client.raw("GET", `invoices/${inv.id}/pdf`);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const outPath = "/tmp/carta-porte-fraccion-test.pdf";
  await writeFile(outPath, pdfBuffer);
  console.log("Saved stamped invoice PDF to", outPath);

  await client.delete(`invoices/${inv.id}`, { motive: "02" });
  console.log("Done — inspect the saved PDF to visually confirm FraccionArancelaria renders per mercancía.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

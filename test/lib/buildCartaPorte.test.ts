import { describe, expect, it } from "vitest";
import {
  buildCartaPorteComplement,
  buildFraccionArancelaria,
  mapPedimentoToMercancias,
  type CartaPorteComplementInput,
  type PedimentoForCartaPorte,
} from "@/lib/buildCartaPorte";

function fixturePedimento(overrides: Partial<PedimentoForCartaPorte> = {}): PedimentoForCartaPorte {
  return {
    pedimentoNum: "264033626000505",
    rfc: "AARC700811CL4",
    identificadoresDocAduanero: [],
    pesoBruto: null,
    partidas: [
      {
        fraccion: "76151002",
        subd: "99",
        descripcion: "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO",
        cantidad: 2,
        umc: null,
        paisOrigen: null,
        pesoKg: 5.26,
      },
    ],
    ...overrides,
  };
}

describe("buildFraccionArancelaria", () => {
  it("concatenates fraccion + subd into the 10-digit SAT catalog key", () => {
    expect(buildFraccionArancelaria("76151002", "99")).toBe("7615100299");
  });

  it("returns undefined when subd is missing", () => {
    expect(buildFraccionArancelaria("76151002", null)).toBeUndefined();
  });

  it("returns undefined when subd isn't a 2-digit code", () => {
    expect(buildFraccionArancelaria("76151002", "9")).toBeUndefined();
    expect(buildFraccionArancelaria("76151002", "abc")).toBeUndefined();
  });
});

describe("mapPedimentoToMercancias", () => {
  it("carries each partida's fraccion+subd onto its mercancía as a 10-digit FraccionArancelaria", () => {
    const { mercancias } = mapPedimentoToMercancias(fixturePedimento());

    expect(mercancias).toHaveLength(1);
    expect(mercancias[0].fraccionArancelaria).toBe("7615100299");
  });

  it("omits fraccionArancelaria when the partida has no subd", () => {
    const { mercancias } = mapPedimentoToMercancias(
      fixturePedimento({ partidas: [{ ...fixturePedimento().partidas[0], subd: null }] })
    );

    expect(mercancias[0].fraccionArancelaria).toBeUndefined();
  });
});

function fixtureComplementInput(overrides: Partial<CartaPorteComplementInput> = {}): CartaPorteComplementInput {
  return {
    ubicacionOrigen: {
      rfc: "AARC700811CL4",
      fechaHoraSalidaLlegada: "2026-01-15T08:00:00",
      domicilio: { Estado: "BCN", Pais: "MEX", CodigoPostal: "22504" },
    },
    ubicacionDestino: {
      rfc: "AARC700811CL4",
      fechaHoraSalidaLlegada: "2026-01-15T20:00:00",
      domicilio: { Estado: "BCN", Pais: "MEX", CodigoPostal: "22010" },
    },
    mercancias: [
      { bienesTransp: "24122004", descripcion: "TAPA", cantidad: 2, claveUnidad: "KGM", pesoEnKg: 5.26 },
    ],
    pesoBrutoTotal: 5.26,
    unidadPeso: "KGM",
    autotransporte: {},
    figurasTransporte: [],
    distanciaRecorridaKm: 18,
    ...overrides,
  };
}

// SAT's c_TipoMateria is only valid (and required) on international
// mercancías — Facturapi rejects it outright otherwise (confirmed against
// the sandbox: see scripts/test-carta-porte-fraccion-arancelaria-pdf.ts).
describe("buildCartaPorteComplement TipoMateria gating", () => {
  it("does not set TipoMateria on a domestic (non-internacional) haul", () => {
    const complement = buildCartaPorteComplement(fixtureComplementInput());

    expect(complement.data.Mercancias.Mercancia[0]).not.toHaveProperty("TipoMateria");
  });

  it("defaults TipoMateria to 01 on an internacional haul when not supplied", () => {
    const complement = buildCartaPorteComplement(
      fixtureComplementInput({
        internacional: { entradaSalidaMerc: "Entrada", paisOrigenDestino: "USA", viaEntradaSalida: "01" },
      })
    );

    expect(complement.data.Mercancias.Mercancia[0].TipoMateria).toBe("01");
  });

  it("preserves a caller-supplied TipoMateria on an internacional haul", () => {
    const complement = buildCartaPorteComplement(
      fixtureComplementInput({
        mercancias: [
          {
            bienesTransp: "24122004",
            descripcion: "TAPA",
            cantidad: 2,
            claveUnidad: "KGM",
            pesoEnKg: 5.26,
            tipoMateria: "02",
          },
        ],
        internacional: { entradaSalidaMerc: "Entrada", paisOrigenDestino: "USA", viaEntradaSalida: "01" },
      })
    );

    expect(complement.data.Mercancias.Mercancia[0].TipoMateria).toBe("02");
  });
});

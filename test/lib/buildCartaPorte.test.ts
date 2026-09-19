import { describe, expect, it } from "vitest";
import { buildFraccionArancelaria, mapPedimentoToMercancias, type PedimentoForCartaPorte } from "@/lib/buildCartaPorte";

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

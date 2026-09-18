import { describe, expect, it } from "vitest";
import { mapPedimentoToMercancias, type PedimentoForCartaPorte } from "@/lib/buildCartaPorte";

function fixturePedimento(overrides: Partial<PedimentoForCartaPorte> = {}): PedimentoForCartaPorte {
  return {
    pedimentoNum: "264033626000505",
    rfc: "AARC700811CL4",
    identificadoresDocAduanero: [],
    pesoBruto: null,
    partidas: [
      {
        fraccion: "84713001",
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

describe("mapPedimentoToMercancias", () => {
  it("carries each partida's fracción arancelaria onto its mercancía", () => {
    const { mercancias } = mapPedimentoToMercancias(fixturePedimento());

    expect(mercancias).toHaveLength(1);
    expect(mercancias[0].fraccionArancelaria).toBe("84713001");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { POST } from "@/app/api/v1/cartas-porte/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

const inlineCliente = {
  legal_name: "Test Carta Porte SA",
  tax_id: "XAXX010101000",
  tax_system: "616",
};

const inlineDireccion = (etiqueta: string) => ({
  etiqueta,
  rfc: "XAXX010101000",
  calle: "Calle Test",
  colonia: "Centro",
  municipio: "Monterrey",
  estado: "Nuevo León",
  pais: "México",
  codigo_postal: "64000",
});

const inlineVehiculo = {
  placa: `TEST-${Date.now()}`,
  permiso_sct: "TPAF01",
  numero_permiso: "PERM123456",
  config_vehicular: "VL",
  peso_bruto_vehicular: "3000",
  aseguradora_resp_civil: "Aseguradora de Prueba",
  poliza_resp_civil: "POL123",
  anio_modelo_vehiculo: "2020",
};
const inlineChofer = { nombre: "Chofer de Prueba", rfc: "XAXX010101000" };
const inlineMercancias = [{ descripcion: "Producto de prueba", cantidad: 1, peso_kg: 10 }];

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    cliente: inlineCliente,
    direccion_origen: inlineDireccion("Origen"),
    direccion_destino: inlineDireccion("Destino"),
    vehiculo: inlineVehiculo,
    chofer: inlineChofer,
    mercancias: inlineMercancias,
    tipo_figura: "01",
    fecha_hora_salida: "2026-01-01T08:00:00",
    fecha_hora_llegada: "2026-01-01T20:00:00",
    distancia_recorrida_km: 500,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(buildRequest("/api/v1/cartas-porte", { method: "POST", headers, body }));
}

describe("/api/v1/cartas-porte POST", () => {
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  it("rejects requests with no Authorization header", async () => {
    const res = await post(basePayload(), { "idempotency-key": randomUUID() });
    expect(res.status).toBe(401);
  });

  it("rejects requests missing the Idempotency-Key header", async () => {
    const res = await post(basePayload(), authHeaders(token));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details).toEqual([{ field: "Idempotency-Key", issue: "missing" }]);
  });

  it("rejects a body that isn't valid JSON", async () => {
    const res = await POST(
      buildRequest("/api/v1/cartas-porte", {
        method: "POST",
        headers: { ...authHeaders(token), "idempotency-key": randomUUID(), "content-type": "application/json" },
        body: undefined,
      })
    );
    // buildRequest with body: undefined sends no body at all, which JSON.parse("") throws on.
    expect(res.status).toBe(400);
  });

  it("rejects a payload missing required top-level fields", async () => {
    const { tipo_figura: _drop, ...rest } = basePayload();
    const res = await post(rest, { ...authHeaders(token), "idempotency-key": randomUUID() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_parameter");
  });

  it("rejects when both cliente_id and inline cliente are provided", async () => {
    const res = await post(basePayload({ cliente_id: "cus_123", cliente: inlineCliente }), {
      ...authHeaders(token),
      "idempotency-key": randomUUID(),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details).toEqual([{ field: "cliente_id", issue: "conflict" }]);
  });

  it("rejects when neither cliente_id nor inline cliente is provided", async () => {
    const { cliente: _drop, ...rest } = basePayload();
    const res = await post(rest, { ...authHeaders(token), "idempotency-key": randomUUID() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details).toEqual([{ field: "cliente_id", issue: "missing" }]);
  });

  it("rejects when both pedimento_id and inline mercancias are provided", async () => {
    const res = await post(basePayload({ pedimento_id: "some-pedimento-id" }), {
      ...authHeaders(token),
      "idempotency-key": randomUUID(),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details).toEqual([{ field: "pedimento_id", issue: "conflict" }]);
  });

  it("rejects when neither pedimento_id nor inline mercancias is provided", async () => {
    const { mercancias: _drop, ...rest } = basePayload();
    const res = await post(rest, { ...authHeaders(token), "idempotency-key": randomUUID() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details).toEqual([{ field: "pedimento_id", issue: "missing" }]);
  });

  it("rejects an inline vehículo missing fields required for a Complemento Carta Porte", async () => {
    const { permiso_sct: _drop, anio_modelo_vehiculo: _drop2, ...incompleteVehiculo } = inlineVehiculo;
    const res = await post(basePayload({ vehiculo: incompleteVehiculo }), {
      ...authHeaders(token),
      "idempotency-key": randomUUID(),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_parameter");
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        { field: "vehiculo.permiso_sct", issue: "missing" },
        { field: "vehiculo.anio_modelo_vehiculo", issue: "missing" },
      ])
    );
  });

  it("creates a draft factura with fully inline party and mercancía data", async () => {
    const res = await post(basePayload(), { ...authHeaders(token), "idempotency-key": randomUUID() });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toEqual(expect.any(String));
  }, 20000);

  it("persists and echoes back external_reference (#68)", async () => {
    const externalReference = `trip-${randomUUID()}`;
    const res = await post(basePayload({ external_reference: externalReference }), {
      ...authHeaders(token),
      "idempotency-key": randomUUID(),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.external_reference).toBe(externalReference);
  }, 20000);

  it("replays the stored response when the same Idempotency-Key + body is sent again", async () => {
    const key = randomUUID();
    const payload = basePayload();
    const first = await post(payload, { ...authHeaders(token), "idempotency-key": key });
    expect(first.status).toBe(201);
    const firstJson = await first.json();

    const second = await post(payload, { ...authHeaders(token), "idempotency-key": key });
    expect(second.status).toBe(201);
    const secondJson = await second.json();
    expect(secondJson.id).toBe(firstJson.id);
  }, 20000);

  it("rejects reusing an Idempotency-Key with a different body", async () => {
    const key = randomUUID();
    const first = await post(basePayload(), { ...authHeaders(token), "idempotency-key": key });
    expect(first.status).toBe(201);

    const second = await post(basePayload({ distancia_recorrida_km: 999 }), {
      ...authHeaders(token),
      "idempotency-key": key,
    });
    expect(second.status).toBe(422);
    const json = await second.json();
    expect(json.error.code).toBe("idempotency_key_reused");
  }, 20000);
});

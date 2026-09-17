// One-off verification of #55 (carta porte references on POST /facturas)
// and #56 (vehículos/choferes/direcciones CRUD) — same "self-contained
// script with its own test org, cleans up after itself" convention as
// scripts/test-api-v1-idempotency.ts.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-carta-porte-and-reference-data.ts
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, choferes, direcciones, organizations, vehiculos } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";
import { resolveCartaPorteReferences } from "../src/lib/v1/cartaPorte";
import { fromPublicId, toPublicId } from "../src/lib/v1/publicId";
import { GET as vehiculosGet, POST as vehiculosPost } from "../src/app/api/v1/vehiculos/route";
import {
  DELETE as vehiculoDelete,
  GET as vehiculoGet,
  PUT as vehiculoPut,
} from "../src/app/api/v1/vehiculos/[id]/route";
import { POST as choferesPost } from "../src/app/api/v1/choferes/route";
import { GET as choferGet } from "../src/app/api/v1/choferes/[id]/route";
import { POST as direccionesPost } from "../src/app/api/v1/direcciones/route";
import { PUT as direccionPut } from "../src/app/api/v1/direcciones/[id]/route";

const ORG = "org_reference_data_test";
const RAW_KEY = "pdm_test_reference_data_test_key";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function cleanup() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(vehiculos).where(eq(vehiculos.orgId, ORG));
    await tx.delete(choferes).where(eq(choferes.orgId, ORG));
    await tx.delete(direcciones).where(eq(direcciones.orgId, ORG));
  });
  await db.delete(apiKeys).where(eq(apiKeys.orgId, ORG));
  await withOrg(ORG, (tx) => tx.delete(apiRateLimits).where(eq(apiRateLimits.orgId, ORG)));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

function authedRequest(url: string, init: NextRequestInit = {}) {
  return new NextRequest(url, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${RAW_KEY}` },
  });
}

async function main() {
  await cleanup();
  await db.insert(organizations).values({ id: ORG }).onConflictDoNothing();
  await db.insert(apiKeys).values({
    orgId: ORG,
    keyHash: createHash("sha256").update(RAW_KEY).digest("hex"),
    mode: "test",
    label: "reference-data-test",
  });

  // ── publicId round-trip ──────────────────────────────────────────────
  assert(toPublicId("veh", "abc-123") === "veh_abc-123", "toPublicId prefixes the raw id");
  assert(fromPublicId("veh", "veh_abc-123") === "abc-123", "fromPublicId strips the prefix");
  assert(fromPublicId("veh", "chf_abc-123") === null, "fromPublicId rejects the wrong prefix");
  assert(fromPublicId("veh", "veh_") === null, "fromPublicId rejects an empty id");

  // ── seed a vehículo/chofer/direcciones pair to reference ────────────
  const [vehiculo] = await withOrg(ORG, (tx) =>
    tx
      .insert(vehiculos)
      .values({
        orgId: ORG,
        placa: "ABC-123",
        configVehicular: "C2",
        permisoSct: "TPAF04",
        numeroPermiso: "1234",
        pesoBrutoVehicular: "10000",
        remolques: [{ subTipoRemolque: "CTR001", placa: "REM-1" }],
      })
      .returning()
  );
  const [inactiveVehiculo] = await withOrg(ORG, (tx) =>
    tx.insert(vehiculos).values({ orgId: ORG, placa: "ZZZ-999", active: false }).returning()
  );
  const [chofer] = await withOrg(ORG, (tx) =>
    tx.insert(choferes).values({ orgId: ORG, nombre: "Juan Pérez", rfc: "PEPJ800101ABC" }).returning()
  );
  const [direccionOrigen] = await withOrg(ORG, (tx) =>
    tx
      .insert(direcciones)
      .values({
        orgId: ORG,
        tipo: "origen",
        etiqueta: "Bodega CDMX",
        rfc: "AAA010101AAA",
        estado: "CDMX",
        pais: "MEX",
        codigoPostal: "01000",
      })
      .returning()
  );
  const [direccionInactiva] = await withOrg(ORG, (tx) =>
    tx
      .insert(direcciones)
      .values({
        orgId: ORG,
        tipo: "destino",
        etiqueta: "Retirada",
        rfc: "BBB010101BBB",
        active: false,
      })
      .returning()
  );

  // ── resolveCartaPorteReferences: happy path ─────────────────────────
  // References are the same veh_/chf_/dir_-prefixed public ids the
  // reference-data GET endpoints return (#56) — not the raw internal uuid.
  const body = {
    complements: [
      {
        type: "carta_porte",
        data: {
          Ubicaciones: [
            {
              TipoUbicacion: "Origen",
              FechaHoraSalidaLlegada: "2026-01-01T08:00:00",
              direccion_id: toPublicId("dir", direccionOrigen.id),
            },
          ],
          Mercancias: {
            Autotransporte: { vehiculo_id: toPublicId("veh", vehiculo.id) },
          },
          FiguraTransporte: [{ TipoFigura: "01", chofer_id: toPublicId("chf", chofer.id) }],
        },
      },
    ],
  };
  const err = await resolveCartaPorteReferences(ORG, body);
  assert(err === null, "resolving valid references does not error");
  const data = body.complements[0].data as Record<string, unknown>;
  assert(typeof data.IdCCP === "string" && (data.IdCCP as string).startsWith("CCC"), "IdCCP is generated");
  const ubicacion = (data.Ubicaciones as Record<string, unknown>[])[0];
  assert(ubicacion.RFCRemitenteDestinatario === direccionOrigen.rfc, "direccion_id resolves RFC");
  assert(!("direccion_id" in ubicacion), "direccion_id is stripped after resolution");
  const autotransporte = (data.Mercancias as Record<string, unknown>).Autotransporte as Record<string, unknown>;
  assert(
    (autotransporte.IdentificacionVehicular as Record<string, unknown>).PlacaVM === vehiculo.placa,
    "vehiculo_id resolves the plate"
  );
  assert(!("vehiculo_id" in autotransporte), "vehiculo_id is stripped after resolution");
  const figura = (data.FiguraTransporte as Record<string, unknown>[])[0];
  assert(figura.RFCFigura === chofer.rfc, "chofer_id resolves the RFC");
  assert(!("chofer_id" in figura), "chofer_id is stripped after resolution");

  // ── resolveCartaPorteReferences: inactive/not-found rejections ──────
  const inactiveVehiculoErr = await resolveCartaPorteReferences(ORG, {
    complements: [
      { type: "carta_porte", data: { Mercancias: { Autotransporte: { vehiculo_id: inactiveVehiculo.id } } } },
    ],
  });
  assert(inactiveVehiculoErr !== null && inactiveVehiculoErr.status === 400, "inactive vehiculo_id is rejected");

  const inactiveDireccionErr = await resolveCartaPorteReferences(ORG, {
    complements: [
      { type: "carta_porte", data: { Ubicaciones: [{ direccion_id: direccionInactiva.id }] } },
    ],
  });
  assert(inactiveDireccionErr !== null && inactiveDireccionErr.status === 400, "inactive direccion_id is rejected");

  const missingErr = await resolveCartaPorteReferences(ORG, {
    complements: [{ type: "carta_porte", data: { Mercancias: { Autotransporte: { vehiculo_id: "nope" } } } }],
  });
  assert(missingErr !== null && missingErr.status === 400, "unknown vehiculo_id is rejected");

  // A raw internal uuid (not the veh_-prefixed public id) must not resolve —
  // clients only ever see the prefixed form, so accepting the bare uuid
  // would be dead flexibility that also risks id-format confusion.
  const rawUuidErr = await resolveCartaPorteReferences(ORG, {
    complements: [{ type: "carta_porte", data: { Mercancias: { Autotransporte: { vehiculo_id: vehiculo.id } } } }],
  });
  assert(rawUuidErr !== null && rawUuidErr.status === 400, "a raw internal uuid (unprefixed) is rejected");

  // ── vehículos CRUD via the route handlers ───────────────────────────
  const createVehRes = await vehiculosPost(
    authedRequest("http://localhost/api/v1/vehiculos", {
      method: "POST",
      body: JSON.stringify({ placa: "NEW-001" }),
    })
  );
  assert(createVehRes.status === 201, "POST /vehiculos creates one");
  const createdVeh = await createVehRes.json();
  assert(createdVeh.id.startsWith("veh_"), "created vehículo has a veh_-prefixed id");

  const listVehRes = await vehiculosGet(authedRequest("http://localhost/api/v1/vehiculos"));
  const listVeh = await listVehRes.json();
  assert(
    listVeh.data.some((v: { id: string }) => v.id === createdVeh.id),
    "GET /vehiculos lists the created row"
  );

  const getVehRes = await vehiculoGet(authedRequest(`http://localhost/api/v1/vehiculos/${createdVeh.id}`), {
    params: Promise.resolve({ id: createdVeh.id }),
  });
  assert(getVehRes.status === 200, "GET /vehiculos/{id} finds it by public id");

  const malformedVehRes = await vehiculoGet(authedRequest("http://localhost/api/v1/vehiculos/not-a-real-id"), {
    params: Promise.resolve({ id: "not-a-real-id" }),
  });
  assert(malformedVehRes.status === 404, "a malformed public id 404s instead of leaking internal ids");

  const updateVehRes = await vehiculoPut(
    authedRequest(`http://localhost/api/v1/vehiculos/${createdVeh.id}`, {
      method: "PUT",
      body: JSON.stringify({ config_vehicular: "C3" }),
    }),
    { params: Promise.resolve({ id: createdVeh.id }) }
  );
  const updatedVeh = await updateVehRes.json();
  assert(updatedVeh.config_vehicular === "C3", "PUT /vehiculos/{id} updates a field");

  const deleteVehRes = await vehiculoDelete(authedRequest(`http://localhost/api/v1/vehiculos/${createdVeh.id}`), {
    params: Promise.resolve({ id: createdVeh.id }),
  });
  const deletedVeh = await deleteVehRes.json();
  assert(deletedVeh.active === false, "DELETE /vehiculos/{id} soft-deletes (active: false)");

  // ── choferes create + retrieve ───────────────────────────────────────
  const createChoferRes = await choferesPost(
    authedRequest("http://localhost/api/v1/choferes", {
      method: "POST",
      body: JSON.stringify({ nombre: "María López", rfc: "LOMX900101ABC" }),
    })
  );
  const createdChofer = await createChoferRes.json();
  assert(createdChofer.id.startsWith("chf_"), "created chofer has a chf_-prefixed id");
  const getChoferRes = await choferGet(authedRequest(`http://localhost/api/v1/choferes/${createdChofer.id}`), {
    params: Promise.resolve({ id: createdChofer.id }),
  });
  assert(getChoferRes.status === 200, "GET /choferes/{id} finds it by public id");

  // ── direcciones: tipo is immutable on PUT ────────────────────────────
  const createDirRes = await direccionesPost(
    authedRequest("http://localhost/api/v1/direcciones", {
      method: "POST",
      body: JSON.stringify({ tipo: "origen", etiqueta: "Test", rfc: "TES010101ABC" }),
    })
  );
  const createdDir = await createDirRes.json();
  assert(createdDir.id.startsWith("dir_"), "created dirección has a dir_-prefixed id");

  const putTipoRes = await direccionPut(
    authedRequest(`http://localhost/api/v1/direcciones/${createdDir.id}`, {
      method: "PUT",
      body: JSON.stringify({ tipo: "destino" }),
    }),
    { params: Promise.resolve({ id: createdDir.id }) }
  );
  assert(putTipoRes.status === 400, "PUT with tipo present is rejected");

  const putOtherFieldRes = await direccionPut(
    authedRequest(`http://localhost/api/v1/direcciones/${createdDir.id}`, {
      method: "PUT",
      body: JSON.stringify({ etiqueta: "Renamed" }),
    }),
    { params: Promise.resolve({ id: createdDir.id }) }
  );
  const putOtherField = await putOtherFieldRes.json();
  assert(putOtherField.tipo === "origen", "tipo is unchanged when the PUT omits it");
  assert(putOtherField.etiqueta === "Renamed", "other fields still update");

  console.log("All #55/#56 assertions passed.");
}

main()
  .then(() => cleanup())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await cleanup();
    process.exit(1);
  });

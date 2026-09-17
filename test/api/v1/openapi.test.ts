import { describe, expect, it } from "vitest";
import { GET as GET_ES } from "@/app/api/v1/openapi.json/route";
import { GET as GET_EN } from "@/app/api/v1/openapi.en.json/route";

describe.each([
  { lang: "es (default)", GET: GET_ES },
  { lang: "en", GET: GET_EN },
])("/api/v1/openapi.json ($lang)", ({ GET }) => {
  it("serves a valid OpenAPI document without requiring auth", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openapi).toEqual(expect.any(String));
    expect(json.paths).toEqual(expect.any(Object));
  });

  it("documents every v1 route registered via registry.registerPath", async () => {
    const res = GET();
    const json = await res.json();
    for (const path of [
      "/clientes",
      "/pedimentos",
      "/facturas",
      "/cartas-porte",
      "/vehiculos",
      "/choferes",
      "/direcciones",
      "/productos",
      "/catalogs/unidades",
      "/catalogs/claves-prod-serv",
      "/jobs/{job_id}",
      "/csd",
      "/webhooks",
      "/webhooks/{id}",
      "/admin/organizations",
    ]) {
      expect(json.paths).toHaveProperty(path);
    }
  });

  it("declares a bearer security scheme", async () => {
    const res = GET();
    const json = await res.json();
    expect(json.components.securitySchemes).toEqual(
      expect.objectContaining({ bearerAuth: expect.objectContaining({ type: "http", scheme: "bearer" }) })
    );
  });

  // Generic completeness check across the WHOLE surface, not just the
  // routes named above — catches an endpoint shipped with no summary, no
  // security requirement, or a 2xx response with no schema, without having
  // to enumerate every path here. This is a cheap floor, not a substitute
  // for per-endpoint field assertions (see the #68-#72 block below for what
  // that looks like) — a route can pass this and still document the wrong
  // fields.
  it("every documented operation has a summary, a security requirement, and a described 2xx response with a schema (except 204)", async () => {
    const res = GET();
    const json = await res.json();
    const violations: string[] = [];

    for (const [path, methods] of Object.entries(json.paths as Record<string, Record<string, any>>)) {
      for (const [method, op] of Object.entries(methods)) {
        const label = `${method.toUpperCase()} ${path}`;
        if (!op.summary) violations.push(`${label}: missing summary`);
        if (!Array.isArray(op.security) || op.security.length === 0) {
          violations.push(`${label}: missing security requirement`);
        }
        const responses = op.responses ?? {};
        const twoxxCodes = Object.keys(responses).filter((c) => c.startsWith("2"));
        if (twoxxCodes.length === 0) violations.push(`${label}: no 2xx response documented`);
        for (const code of twoxxCodes) {
          const resp = responses[code];
          if (!resp.description) violations.push(`${label} ${code}: missing response description`);
          if (code !== "204" && (!resp.content || Object.keys(resp.content).length === 0)) {
            violations.push(`${label} ${code}: missing response body schema`);
          }
        }
        if (!op.tags || op.tags.length === 0) violations.push(`${label}: missing tags`);
      }
    }

    expect(violations).toEqual([]);
  });

  // #68-#72 regression guard: each shipped feature must actually surface in
  // the generated spec, not just have a passing behavior test — a dropped
  // registerPath call or an unwired schema field would otherwise go
  // unnoticed here even though the route itself still works.
  it("documents external_reference (#68) on POST /cartas-porte and POST /facturas", async () => {
    const res = GET();
    const json = await res.json();
    for (const path of ["/cartas-porte", "/facturas"]) {
      const schema = json.paths[path].post.requestBody.content["application/json"].schema;
      expect(schema.properties).toHaveProperty("external_reference");
      expect(schema.properties.external_reference.type).toBe("string");
    }
  });

  it("documents external_reference (#68) as a filter on GET /facturas", async () => {
    const res = GET();
    const json = await res.json();
    const params = json.paths["/facturas"].get.parameters ?? [];
    expect(params).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "external_reference", in: "query" })])
    );
  });

  it("documents the CSD upload endpoint (#69)", async () => {
    const res = GET();
    const json = await res.json();
    const post = json.paths["/csd"].post;
    const schema = post.requestBody.content["multipart/form-data"].schema;
    expect(schema.properties).toEqual(expect.objectContaining({ cer: expect.anything(), key: expect.anything(), password: expect.anything() }));
    expect(post.responses["200"]).toBeDefined();
  });

  it("documents webhook subscription CRUD (#70)", async () => {
    const res = GET();
    const json = await res.json();
    expect(json.paths["/webhooks"].get).toBeDefined();
    expect(json.paths["/webhooks"].post).toBeDefined();
    expect(json.paths["/webhooks/{id}"].delete).toBeDefined();
  });

  it("documents RFC/CP fields as plain strings on clientes/direcciones/choferes (#71)", async () => {
    const res = GET();
    const json = await res.json();
    const clienteSchema = json.paths["/clientes"].post.requestBody.content["application/json"].schema;
    expect(clienteSchema.properties.tax_id.type).toBe("string");
    const direccionSchema = json.paths["/direcciones"].post.requestBody.content["application/json"].schema;
    expect(direccionSchema.properties.rfc.type).toBe("string");
    expect(direccionSchema.properties.codigo_postal.type).toBe("string");
  });

  it("documents the self-serve org provisioning endpoint (#72), gated by a distinct security scheme", async () => {
    const res = GET();
    const json = await res.json();
    const post = json.paths["/admin/organizations"].post;
    expect(post.requestBody.content["application/json"].schema.properties).toHaveProperty("org_name");
    expect(post.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ platformAdminAuth: expect.anything() })])
    );
    // Distinct from the tenant bearerAuth scheme used by every other route —
    // this endpoint must never be reachable with an ordinary API key.
    expect(post.security).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ bearerAuth: expect.anything() })])
    );
  });

  // Full-surface field regression guard: unlike #68-#72 above (one feature
  // each), these cover every remaining route group so a renamed/dropped
  // field, a required field marked optional (or vice versa), or a stale
  // nullable/enum goes red here even though the generic completeness check
  // above still passes (it only checks a summary/security/2xx schema exist,
  // not that the schema's properties are the right ones).

  describe("/clientes field regression guard", () => {
    it("requires legal_name/tax_id/tax_system and allows optional zip/email/emails on POST", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/clientes"].post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["legal_name", "tax_id", "tax_system"]);
      expect(schema.properties.legal_name.type).toBe("string");
      expect(schema.properties.tax_id.type).toBe("string");
      expect(schema.properties.tax_system.type).toBe("string");
      expect(schema.properties.zip.type).toBe("string");
      expect(schema.properties.email.type).toBe("string");
      expect(schema.properties.emails).toEqual({ type: "array", items: { type: "string" } });
    });

    it("documents q/limit/offset as optional query params on GET /clientes", async () => {
      const res = GET();
      const json = await res.json();
      const params = json.paths["/clientes"].get.parameters;
      expect(params).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "q", in: "query", required: false, schema: { type: "string" } }),
          expect.objectContaining({ name: "limit", in: "query", required: false }),
          expect.objectContaining({ name: "offset", in: "query", required: false }),
        ])
      );
    });

    it("documents the paginated cliente shape (data[] + meta) on GET /clientes", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/clientes"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual(["data", "meta"]);
      const item = schema.properties.data.items;
      expect(item.required).toEqual(["id", "legal_name", "tax_id", "tax_system", "zip", "email", "emails"]);
      expect(item.properties.tax_id.type).toEqual(["string", "null"]);
      expect(item.properties.zip.type).toEqual(["string", "null"]);
      expect(item.properties.email.type).toEqual(["string", "null"]);
      expect(schema.properties.meta.required).toEqual(["limit", "offset", "total"]);
    });

    it("documents the same cliente shape and a 404 on GET/PUT /clientes/{id}", async () => {
      const res = GET();
      const json = await res.json();
      for (const op of [json.paths["/clientes/{id}"].get, json.paths["/clientes/{id}"].put]) {
        const schema = op.responses["200"].content["application/json"].schema;
        expect(schema.required).toEqual(["id", "legal_name", "tax_id", "tax_system", "zip", "email", "emails"]);
        expect(op.responses["404"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
      }
      // Every field is optional on PUT — a caller updates only what it sends.
      const putBody = json.paths["/clientes/{id}"].put.requestBody.content["application/json"].schema;
      expect(putBody.required).toBeUndefined();
      expect(Object.keys(putBody.properties).sort()).toEqual(
        ["email", "emails", "legal_name", "tax_id", "tax_system", "zip"].sort()
      );
    });

    it("documents DELETE /clientes/{id} as a 204 hard delete with a 404", async () => {
      const res = GET();
      const json = await res.json();
      const del = json.paths["/clientes/{id}"].delete;
      expect(del.responses["204"]).toBeDefined();
      expect(del.responses["204"].content).toBeUndefined();
      expect(del.responses["404"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
    });
  });

  describe("/direcciones field regression guard", () => {
    it("requires tipo/etiqueta/rfc and documents tipo's enum on POST", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/direcciones"].post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["tipo", "etiqueta", "rfc"]);
      expect(schema.properties.tipo).toEqual({ type: "string", enum: ["origen", "destino"] });
      for (const field of ["nombre", "calle", "numero_exterior", "numero_interior", "colonia", "municipio", "localidad", "estado", "pais", "codigo_postal"]) {
        expect(schema.properties[field].type).toBe("string");
      }
    });

    it("documents active/tipo as enum query filters on GET /direcciones", async () => {
      const res = GET();
      const json = await res.json();
      const params = json.paths["/direcciones"].get.parameters;
      expect(params).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "active", schema: { type: "string", enum: ["true", "false"] } }),
          expect.objectContaining({ name: "tipo", schema: { type: "string", enum: ["origen", "destino"] } }),
        ])
      );
    });

    it("documents every dirección field as nullable (except id/tipo/etiqueta/rfc/active/created_at) on GET /direcciones/{id}", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/direcciones/{id}"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual([
        "id", "tipo", "etiqueta", "rfc", "nombre", "calle", "numero_exterior", "numero_interior",
        "colonia", "municipio", "localidad", "estado", "pais", "codigo_postal", "active", "created_at",
      ]);
      for (const field of ["nombre", "calle", "numero_exterior", "numero_interior", "colonia", "municipio", "localidad", "estado", "pais", "codigo_postal"]) {
        expect(schema.properties[field].type).toEqual(["string", "null"]);
      }
      expect(schema.properties.active.type).toBe("boolean");
      expect(json.paths["/direcciones/{id}"].get.responses["404"].content["application/json"].schema).toEqual({
        $ref: "#/components/schemas/Error",
      });
    });

    // tipo is immutable (#56) — a route-level check rejects it before this
    // schema is even consulted, but the schema itself must never grow a
    // `tipo` property or the immutable contract silently breaks.
    it("never documents tipo as an updatable field on PUT /direcciones/{id}", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/direcciones/{id}"].put.requestBody.content["application/json"].schema;
      expect(schema.properties).not.toHaveProperty("tipo");
      expect(schema.required).toBeUndefined();
      expect(Object.keys(schema.properties).sort()).toEqual(
        ["etiqueta", "rfc", "nombre", "calle", "numero_exterior", "numero_interior", "colonia", "municipio", "localidad", "estado", "pais", "codigo_postal"].sort()
      );
    });

    it("documents DELETE /direcciones/{id} as a 200 soft-deactivate, not a 204", async () => {
      const res = GET();
      const json = await res.json();
      const del = json.paths["/direcciones/{id}"].delete;
      expect(del.responses["200"].content["application/json"].schema.properties.active.type).toBe("boolean");
      expect(del.responses["204"]).toBeUndefined();
      expect(del.responses["404"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
    });
  });

  describe("/vehiculos field regression guard", () => {
    it("requires only placa on POST, with nested remolques[] items required", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/vehiculos"].post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["placa"]);
      for (const field of ["config_vehicular", "permiso_sct", "numero_permiso", "aseguradora_carga", "poliza_carga", "aseguradora_resp_civil", "poliza_resp_civil", "peso_bruto_vehicular", "anio_modelo_vehiculo"]) {
        expect(schema.properties[field].type).toBe("string");
      }
      expect(schema.properties.remolques.items).toEqual({
        type: "object",
        properties: { sub_tipo_remolque: { type: "string" }, placa: { type: "string" } },
        required: ["sub_tipo_remolque", "placa"],
      });
    });

    it("documents active as an enum query filter on GET /vehiculos", async () => {
      const res = GET();
      const json = await res.json();
      const params = json.paths["/vehiculos"].get.parameters;
      expect(params).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "active", schema: { type: "string", enum: ["true", "false"] } })])
      );
    });

    it("documents every optional vehículo field as nullable, with remolques[] required in the response item", async () => {
      const res = GET();
      const json = await res.json();
      const item = json.paths["/vehiculos"].get.responses["200"].content["application/json"].schema.properties.data.items;
      expect(item.required).toEqual([
        "id", "placa", "config_vehicular", "permiso_sct", "numero_permiso", "aseguradora_carga", "poliza_carga",
        "aseguradora_resp_civil", "poliza_resp_civil", "peso_bruto_vehicular", "anio_modelo_vehiculo",
        "remolques", "active", "created_at",
      ]);
      for (const field of ["config_vehicular", "permiso_sct", "numero_permiso", "aseguradora_carga", "poliza_carga", "aseguradora_resp_civil", "poliza_resp_civil", "peso_bruto_vehicular", "anio_modelo_vehiculo"]) {
        expect(item.properties[field].type).toEqual(["string", "null"]);
      }
      expect(item.properties.remolques.items.required).toEqual(["sub_tipo_remolque", "placa"]);
    });

    it("documents a 404 on GET/PUT/DELETE /vehiculos/{id}, and PUT leaves every field optional", async () => {
      const res = GET();
      const json = await res.json();
      for (const method of ["get", "put", "delete"] as const) {
        expect(json.paths["/vehiculos/{id}"][method].responses["404"].content["application/json"].schema).toEqual({
          $ref: "#/components/schemas/Error",
        });
      }
      const putBody = json.paths["/vehiculos/{id}"].put.requestBody.content["application/json"].schema;
      expect(putBody.required).toBeUndefined();
      // DELETE deactivates (#56) — 200 with the deactivated row, not a 204.
      expect(json.paths["/vehiculos/{id}"].delete.responses["200"]).toBeDefined();
      expect(json.paths["/vehiculos/{id}"].delete.responses["204"]).toBeUndefined();
    });
  });

  describe("/choferes field regression guard", () => {
    it("requires nombre/rfc and allows optional numero_licencia on POST", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/choferes"].post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["nombre", "rfc"]);
      expect(schema.properties.numero_licencia.type).toBe("string");
    });

    it("documents the chofer response shape, with numero_licencia nullable", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/choferes/{id}"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual(["id", "nombre", "rfc", "numero_licencia", "active", "created_at"]);
      expect(schema.properties.numero_licencia.type).toEqual(["string", "null"]);
      expect(schema.properties.rfc.type).toBe("string");
    });

    it("documents a 404 on GET/PUT/DELETE /choferes/{id}, DELETE soft-deactivates (200, no 204)", async () => {
      const res = GET();
      const json = await res.json();
      for (const method of ["get", "put", "delete"] as const) {
        expect(json.paths["/choferes/{id}"][method].responses["404"].content["application/json"].schema).toEqual({
          $ref: "#/components/schemas/Error",
        });
      }
      expect(json.paths["/choferes/{id}"].delete.responses["200"]).toBeDefined();
      expect(json.paths["/choferes/{id}"].delete.responses["204"]).toBeUndefined();
      const putBody = json.paths["/choferes/{id}"].put.requestBody.content["application/json"].schema;
      expect(putBody.required).toBeUndefined();
      expect(Object.keys(putBody.properties).sort()).toEqual(["nombre", "rfc", "numero_licencia"].sort());
    });
  });

  describe("/productos field regression guard", () => {
    it("requires fraccion/descripcion and allows optional clave_prod_serv/descripcion_sat/unit_key/confidence on POST", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/productos"].post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["fraccion", "descripcion"]);
      for (const field of ["clave_prod_serv", "descripcion_sat", "unit_key", "confidence"]) {
        expect(schema.properties[field].type).toBe("string");
      }
    });

    it("documents fraccion as an optional query filter on GET /productos", async () => {
      const res = GET();
      const json = await res.json();
      const params = json.paths["/productos"].get.parameters;
      expect(params).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "fraccion", in: "query", required: false, schema: { type: "string" } })])
      );
    });

    it("documents the producto response shape, unit_key always present, the rest nullable", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/productos/{id}"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual(["id", "fraccion", "descripcion", "clave_prod_serv", "descripcion_sat", "unit_key", "confidence"]);
      expect(schema.properties.unit_key.type).toBe("string");
      for (const field of ["clave_prod_serv", "descripcion_sat", "confidence"]) {
        expect(schema.properties[field].type).toEqual(["string", "null"]);
      }
    });

    // #57: productos has no `active` column — DELETE is a genuine hard
    // delete (204), unlike direcciones/vehiculos/choferes' soft-deactivate.
    it("documents DELETE /productos/{id} as a 204 hard delete, and PUT leaves fraccion out entirely", async () => {
      const res = GET();
      const json = await res.json();
      expect(json.paths["/productos/{id}"].delete.responses["204"]).toBeDefined();
      expect(json.paths["/productos/{id}"].delete.responses["204"].content).toBeUndefined();
      for (const method of ["get", "put", "delete"] as const) {
        expect(json.paths["/productos/{id}"][method].responses["404"].content["application/json"].schema).toEqual({
          $ref: "#/components/schemas/Error",
        });
      }
      const putBody = json.paths["/productos/{id}"].put.requestBody.content["application/json"].schema;
      expect(putBody.properties).not.toHaveProperty("fraccion");
      expect(Object.keys(putBody.properties).sort()).toEqual(["descripcion", "clave_prod_serv", "descripcion_sat", "unit_key", "confidence"].sort());
    });

    it("documents a 409 (shared Error schema) for a duplicate fracción on POST /productos", async () => {
      const res = GET();
      const json = await res.json();
      const conflict = json.paths["/productos"].post.responses["409"];
      expect(conflict.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
    });
  });

  describe("/pedimentos field regression guard", () => {
    it("requires a binary file and documents auto_classify as an optional flag on POST (multipart)", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/pedimentos"].post.requestBody.content["multipart/form-data"].schema;
      expect(schema.required).toEqual(["file"]);
      expect(schema.properties.file).toMatchObject({ type: "string", format: "binary" });
      expect(schema.properties.auto_classify.type).toBe("string");
    });

    it("documents 202/400/401/413 on POST /pedimentos", async () => {
      const res = GET();
      const json = await res.json();
      expect(Object.keys(json.paths["/pedimentos"].post.responses).sort()).toEqual(["202", "400", "401", "413"]);
    });

    it("documents every top-level pedimento field, with only pedimento_id/num/importador/tipo_cambio/source_filename/fecha_upload/identificadores_doc_aduanero/partidas required as non-null", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/pedimentos/{id}"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual([
        "pedimento_id", "pedimento_num", "importador", "tipo_cambio", "source_filename", "fecha_upload",
        "dta", "igi", "prv", "rfc", "domicilio_fiscal", "regimen", "cve_pedimento", "factura_numero",
        "fecha_pedimento", "fecha_entrada", "fecha_pago", "clave_aduana", "peso_bruto",
        "identificadores_doc_aduanero", "partidas",
      ]);
      for (const field of ["dta", "igi", "prv", "peso_bruto"]) {
        expect(schema.properties[field].type).toEqual(["number", "null"]);
      }
      for (const field of ["rfc", "domicilio_fiscal", "regimen", "cve_pedimento", "factura_numero", "fecha_pedimento", "fecha_entrada", "fecha_pago", "clave_aduana"]) {
        expect(schema.properties[field].type).toEqual(["string", "null"]);
      }
      expect(schema.properties.identificadores_doc_aduanero).toEqual({ type: "array", items: { type: "string" } });
    });

    it("documents every partida field, including the clave_prod_serv_mapped sentinel (#60)", async () => {
      const res = GET();
      const json = await res.json();
      const item = json.paths["/pedimentos/{id}"].get.responses["200"].content["application/json"].schema.properties.partidas.items;
      expect(item.required).toEqual([
        "sec", "fraccion", "subd", "descripcion", "marca", "pais_origen", "nom_clave", "cantidad",
        "val_aduana", "val_comercial", "precio_unitario", "tiene_incrementables", "umc", "tipo_cambio",
        "peso_kg", "clave_prod_serv", "clave_prod_serv_description", "clave_prod_serv_confidence",
        "clave_prod_serv_mapped", "clave_unidad",
      ]);
      // clave_unidad is always resolved deterministically (src/lib/umc.ts) —
      // never nullable, unlike the AI-mapped clave_prod_serv_* trio.
      expect(item.properties.clave_unidad.type).toBe("string");
      expect(item.properties.clave_prod_serv_mapped.type).toBe("boolean");
      for (const field of ["subd", "marca", "pais_origen", "nom_clave", "umc", "clave_prod_serv", "clave_prod_serv_description", "clave_prod_serv_confidence"]) {
        expect(item.properties[field].type).toEqual(["string", "null"]);
      }
      for (const field of ["tipo_cambio", "peso_kg"]) {
        expect(item.properties[field].type).toEqual(["number", "null"]);
      }
    });

    it("documents a 404 on GET /pedimentos/{id}", async () => {
      const res = GET();
      const json = await res.json();
      expect(json.paths["/pedimentos/{id}"].get.responses["404"].content["application/json"].schema).toEqual({
        $ref: "#/components/schemas/Error",
      });
    });
  });

  describe("/jobs/{job_id} field regression guard", () => {
    it("requires only job_id/status/created_at; finished_at/pedimento_id/duplicate/error stay optional", async () => {
      const res = GET();
      const json = await res.json();
      const schema = json.paths["/jobs/{job_id}"].get.responses["200"].content["application/json"].schema;
      expect(schema.required).toEqual(["job_id", "status", "created_at"]);
      expect(schema.properties.status).toEqual({ type: "string", enum: ["pending", "processing", "done", "failed"] });
      expect(schema.properties.error).toEqual({
        type: "object",
        properties: { code: { type: "string" }, message: { type: "string" } },
        required: ["code", "message"],
      });
    });

    it("documents a 404 for an unknown job", async () => {
      const res = GET();
      const json = await res.json();
      expect(json.paths["/jobs/{job_id}"].get.responses["404"].content["application/json"].schema).toEqual({
        $ref: "#/components/schemas/Error",
      });
    });
  });

  describe("/catalogs field regression guard", () => {
    it("documents q as an optional query param and {key, description} results on both catalog endpoints", async () => {
      const res = GET();
      const json = await res.json();
      for (const path of ["/catalogs/unidades", "/catalogs/claves-prod-serv"]) {
        const params = json.paths[path].get.parameters;
        expect(params).toEqual(expect.arrayContaining([expect.objectContaining({ name: "q", required: false })]));
        const item = json.paths[path].get.responses["200"].content["application/json"].schema.properties.data.items;
        expect(item).toMatchObject({
          type: "object",
          properties: { key: { type: "string" }, description: { type: "string" } },
          required: ["key", "description"],
        });
      }
    });
  });

  describe("/facturas/{id}/pdf and /xml field regression guard", () => {
    it("documents a binary 200 and a 404 on both download endpoints", async () => {
      const res = GET();
      const json = await res.json();
      for (const [path, contentType] of [
        ["/facturas/{id}/pdf", "application/pdf"],
        ["/facturas/{id}/xml", "application/xml"],
      ] as const) {
        const get = json.paths[path].get;
        expect(get.responses["200"].content[contentType].schema).toMatchObject({ type: "string", format: "binary" });
        expect(get.responses["404"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Error" });
      }
    });
  });

  it("never names the underlying stamping-provider vendor in public docs", async () => {
    const res = GET();
    const json = await res.json();
    expect(JSON.stringify(json)).not.toMatch(/FacturAPI/i);
  });
});

describe("/api/v1/openapi.json (es) translation", () => {
  it("does not throw for missing translations (i.e. every summary/description is covered)", async () => {
    // translateDocument() throws in dev/test when a generated string has no
    // dictionary entry, so a successful call already proves full coverage.
    expect(() => GET_ES()).not.toThrow();
  });

  it("translates a known summary and description into Spanish", async () => {
    const res = GET_ES();
    const json = await res.json();
    expect(json.paths["/clientes"].post.summary).toBe("Crea un cliente");
    expect(json.tags.find((t: { name: string }) => t.name === "pedimentos").description).toBe(
      "Sube y consulta pedimentos analizados."
    );
  });

  it("keeps the English document canonical and untranslated", async () => {
    const res = GET_EN();
    const json = await res.json();
    expect(json.paths["/clientes"].post.summary).toBe("Create a cliente");
    expect(json.tags.find((t: { name: string }) => t.name === "pedimentos").description).toBe(
      "Upload and retrieve parsed pedimentos."
    );
  });
});

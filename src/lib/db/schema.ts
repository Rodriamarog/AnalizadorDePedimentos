import {
  boolean,
  customType,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Keyed by the Clerk organization id (e.g. "org_xxx"). Clerk remains the
// source of truth for membership/roles; this table only holds app-specific
// data Clerk doesn't store.
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  facturapiKeyEncrypted: text("facturapi_key_encrypted"),
  // "demo": auto-provisioned with a FacturAPI *test* key (no real timbrado).
  // "live": real FacturAPI key, either auto-provisioned after a Stripe
  // upgrade or pasted in manually (manualFacturapiKey).
  plan: text("plan").notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // FacturAPI's own org id — needed to call cert-upload and other org-scoped
  // management endpoints with the org's own key.
  facturapiOrgId: text("facturapi_org_id"),
  // Orgs that manage their own FacturAPI account/key manually (paste-a-key
  // flow) are exempt from auto-provisioning and never get the CSD upload UI.
  manualFacturapiKey: boolean("manual_facturapi_key").notNull().default(false),
  // Status marker only — no expiry tracking; FacturAPI itself rejects
  // invoicing once a cert lapses. The cert/key/password are never persisted.
  csdUploadedAt: timestamp("csd_uploaded_at", { withTimezone: true }),
});

// ── Tenant-scoped tables (RLS-protected, see drizzle/0001_rls.sql) ─────────

export const pedimentos = pgTable("pedimentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  pedimentoNum: text("pedimento_num").notNull(),
  importador: text("importador").notNull(),
  tipoCambio: doublePrecision("tipo_cambio").notNull(),
  pdfFilename: text("pdf_filename").notNull(),
  fechaUpload: timestamp("fecha_upload", { withTimezone: true }).notNull().defaultNow(),
  dta: integer("dta"),
  igi: integer("igi"),
  prv: integer("prv"),
  // Fields below are only needed to auto-fill the "Solicitud de Servicios de
  // Inspección" (NOM) docx per partida — not used anywhere else in the app.
  rfc: text("rfc"),
  domicilioFiscal: text("domicilio_fiscal"),
  regimen: text("regimen"),
  // "CVE. PEDIMENTO" (SAT c_ClavePedimento, e.g. "C1" = consolidado, "A1" =
  // definitivo) — shown alongside regimen on facturas linked to this
  // pedimento (see factura-form.tsx's pdf_custom_section).
  cvePedimento: text("cve_pedimento"),
  facturaNumero: text("factura_numero"),
  fechaPedimento: date("fecha_pedimento"),
  fechaEntrada: date("fecha_entrada"),
  // Fecha de pago (from the pedimento's "FECHAS" box) and the 3-digit
  // "CLAVE DE LA SECCION ADUANERA DE DESPACHO" (aduana + sección) — shown on
  // facturas linked to this pedimento, alongside the pedimento number.
  fechaPago: date("fecha_pago"),
  claveAduana: text("clave_aduana"),
  // Total shipment weight in kg, from the header's "PESO BRUTO" — prefills
  // Carta Porte's PesoBrutoTotal (see mapPedimentoToMercancias).
  pesoBruto: doublePrecision("peso_bruto"),
  // Header-level "ED" (Documento digitalizado) identificadores — VUCEM
  // reference numbers of documents annexed to the pedimento. Prefills Carta
  // Porte's DocumentacionAduanera.IdentDocAduanero (see buildCartaPorte.ts).
  identificadoresDocAduanero: jsonb("identificadores_doc_aduanero").$type<string[]>().notNull().default([]),
});

export const partidas = pgTable("partidas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  pedimentoId: text("pedimento_id").notNull().references(() => pedimentos.id),
  sec: integer("sec").notNull(),
  fraccion: text("fraccion").notNull(),
  descripcion: text("descripcion").notNull(),
  cantidad: doublePrecision("cantidad").notNull(),
  valAduana: integer("val_aduana").notNull(),
  valComercial: integer("val_comercial").notNull(),
  precioUnitario: doublePrecision("precio_unitario").notNull(),
  tieneIncrementables: boolean("tiene_incrementables").notNull(),
  umc: text("umc"),
  // Per-partida T.C. override, for pedimentos covered by multiple invoices
  // paid on different dates (each with its own real exchange rate). Null
  // means "use the pedimento's tipoCambio" (the common case).
  tipoCambio: doublePrecision("tipo_cambio"),
  // Weight in kg, derived from the pedimento's UMT (unidad de tarifa)
  // columns — null when that fracción's tariff unit isn't kilograms. Used to
  // prefill Carta Porte mercancía PesoEnKg (see buildCartaPorte.ts).
  pesoKg: doublePrecision("peso_kg"),
  // Fields below are only needed to auto-fill the "Solicitud de Servicios de
  // Inspección" (NOM) docx per partida — not used anywhere else in the app.
  subd: text("subd"),
  marca: text("marca"),
  paisOrigen: text("pais_origen"),
  // The NOM clave declared on the pedimento for this partida (e.g.
  // "NOM-050-SCFI-2004"), or null if the partida has none — a partida with
  // no NOM clave doesn't need an inspection request generated for it.
  nomClave: text("nom_clave"),
});

// Fracción → ClaveProdServ mapping. Per-org: two tenants can map the same
// fracción to different SAT product/service keys.
export const productos = pgTable(
  "productos",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    fraccion: text("fraccion").notNull(),
    descripcion: text("descripcion").notNull(),
    claveProdServ: text("clave_prod_serv"),
    descripcionSat: text("descripcion_sat"),
    unitKey: text("unit_key").notNull().default("H87"),
    confidence: text("confidence"),
    facturapiId: text("facturapi_id"),
  },
  (t) => [unique("productos_org_fraccion_unique").on(t.orgId, t.fraccion)]
);

// A remolque saved on a vehiculo: SAT's ClaveSubTipoRemolque catalog key
// plus the trailer's own plate. Stored inline as jsonb (0-2 entries per
// vehiculo, no independent identity/query needs) rather than a child table.
export type Remolque = { subTipoRemolque: string; placa: string };

// The business's own fleet, org-scoped like productos. Feeds Complemento
// Carta Porte's Autotransporte/Seguros/Remolques blocks (see issue #3) —
// not a FacturAPI concept, purely local data.
export const vehiculos = pgTable("vehiculos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  placa: text("placa").notNull(),
  configVehicular: text("config_vehicular"),
  permisoSct: text("permiso_sct"),
  numeroPermiso: text("numero_permiso"),
  aseguradoraCarga: text("aseguradora_carga"),
  polizaCarga: text("poliza_carga"),
  aseguradoraRespCivil: text("aseguradora_resp_civil"),
  polizaRespCivil: text("poliza_resp_civil"),
  // Text, not numeric/integer — mirrors how Carta Porte's Autotransporte
  // fields are captured elsewhere (e.g. AnioModeloVM is a string in
  // FacturAPI's schema, see buildCartaPorte.ts) and keeps every registry
  // field the same "raw string, parsed at submit time" shape.
  pesoBrutoVehicular: text("peso_bruto_vehicular"),
  anioModeloVehiculo: text("anio_modelo_vehiculo"),
  remolques: jsonb("remolques").$type<Remolque[]>().notNull().default([]),
  // Edits mark a vehiculo inactive instead of deleting it, so a
  // since-retired truck stays intact on historical Carta Porte invoices
  // that already reference it, while new pickers only offer active ones.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Frequently-used Origen/Destino addresses, org-scoped like vehiculos. Feeds
// Complemento Carta Porte's Ubicaciones block. Deliberately excludes
// FechaHoraSalidaLlegada — that's specific to a single shipment, not the
// address itself, so it's always typed fresh even when the rest of the
// ubicación is picked from here. Permanently classified as origen/destino
// (issue #21) — a dirección saved as one can't be reused as the other.
export const direcciones = pgTable("direcciones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  // Permanent Origen/Destino classification (issue #21) — drives the
  // two-grid Direcciones page and the Carta Porte tipo-filtered picker.
  tipo: text("tipo").notNull(),
  // Short human label for the picker list (e.g. "Bodega CDMX") — RFC/nombre
  // alone aren't memorable enough to scan in a dropdown.
  etiqueta: text("etiqueta").notNull(),
  rfc: text("rfc").notNull(),
  nombre: text("nombre"),
  calle: text("calle"),
  numeroExterior: text("numero_exterior"),
  numeroInterior: text("numero_interior"),
  colonia: text("colonia"),
  municipio: text("municipio"),
  localidad: text("localidad"),
  estado: text("estado"),
  pais: text("pais"),
  codigoPostal: text("codigo_postal"),
  // Set when this dirección was resolved from a Google Places suggestion
  // (issue #19) — drives the "verified" badge and, per issue #20, lets the
  // Carta Porte distance calc query Google by place_id instead of a
  // reassembled address string.
  googlePlaceId: text("google_place_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The business's own drivers/operadores, org-scoped like productos. Feeds
// Complemento Carta Porte's FiguraTransporte block (see issue #3). Same
// deactivate-don't-delete reasoning as vehiculos.
export const choferes = pgTable("choferes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  nombre: text("nombre").notNull(),
  rfc: text("rfc").notNull(),
  numeroLicencia: text("numero_licencia"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const facturas = pgTable("facturas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  facturapiId: text("facturapi_id").notNull(),
  uuid: text("uuid"),
  pedimentoId: text("pedimento_id").references(() => pedimentos.id),
  status: text("status").notNull(),
  cancellationStatus: text("cancellation_status").notNull().default("none"),
  // CFDI `type` ("I" Ingreso, "E" Egreso/nota de crédito, "P" Pago, "N"
  // Nómina, "T" Traslado). `relatedUuid` is the folio fiscal of the invoice
  // this one credits (only set for nota de crédito rows) — a UUID rather
  // than a foreign key to `facturas.id` because the related invoice is
  // identified to FacturAPI by UUID, and that's also what's echoed back on
  // the create-invoice response we save from.
  cfdiType: text("cfdi_type").notNull().default("I"),
  relatedUuid: text("related_uuid"),
  paymentMethod: text("payment_method").notNull(),
  total: doublePrecision("total").notNull(),
  currency: text("currency").notNull().default("MXN"),
  customerName: text("customer_name").notNull(),
  customerTaxId: text("customer_tax_id").notNull(),
  serie: text("serie"),
  folioNumber: integer("folio_number"),
  fecha: timestamp("fecha", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Caller-supplied trip/operation id (#68) — durable, customer-visible
  // reference for looking up/filtering a resource later, unlike
  // Idempotency-Key which only dedups a single request. Set at creation
  // only; never overwritten by later saveFactura() calls (e.g. stamping).
  externalReference: text("external_reference"),
});

// Extra send-to addresses for a cliente, beyond the single `email` FacturAPI
// stores on its Customer object (which has no array/multi-email field) —
// used only to prefill the "send factura by email" form; the FacturAPI
// customer email remains the primary/first address.
export const clienteEmails = pgTable(
  "cliente_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    customerId: text("customer_id").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("cliente_emails_org_customer_email_unique").on(t.orgId, t.customerId, t.email)]
);

export const complementosPago = pgTable("complementos_pago", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  facturapiId: text("facturapi_id").notNull(),
  uuid: text("uuid"),
  facturaId: text("factura_id").notNull().references(() => facturas.id),
  fechaPago: date("fecha_pago").notNull(),
  monto: doublePrecision("monto").notNull(),
  formaPago: text("forma_pago").notNull(),
  tipoCambio: doublePrecision("tipo_cambio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Client-submitted sample pedimentos/facturas used to build their custom
// parser (issue #32) — org-scoped like productos. One row per file; rows
// from the same upload submission share a batchId so batches accumulate
// over time and nothing is ever overwritten or deleted by a later upload.
export const sampleFiles = pgTable("sample_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  batchId: text("batch_id").notNull(),
  filename: text("filename").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Global reference tables (shared across all tenants, no RLS) ────────────

export const satClaves = pgTable("sat_claves", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const satUnidades = pgTable("sat_unidades", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

// ── API v1 (issue #50) ──────────────────────────────────────────────────

// Keys for the public /api/v1 namespace (#35). Issued self-serve from
// Configuración (POST /api/settings/api-keys), by scripts/issue-api-key.ts
// for an existing org, or as part of onboarding a brand-new org via
// POST /api/v1/admin/organizations (#72). Only the hash is stored; the raw
// key is shown once at issuance. Not RLS-protected like `organizations`:
// resolving a key is what *establishes* org context, so it can't already
// be scoped by it.
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  keyHash: text("key_hash").notNull().unique(),
  // Mirrors the org's FacturAPI key mode ("test" | "live") at issuance time.
  mode: text("mode").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Dedup store for the v1 API's Idempotency-Key support (#41). One row per
// (org, key); replaying the same key+body returns the original response
// instead of re-running the handler.
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("idempotency_keys_org_key_unique").on(t.orgId, t.key)]
);

// Fixed-window request counters for the v1 API's flat rate limit (#51). One
// row per (org, windowStart); windowStart is truncated to the minute, so a
// request's count is upserted with `count = count + 1` against the current
// minute's row. No plan-tier gating (#39) — the same limit applies to every
// org regardless of plan or key mode.
export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull().references(() => organizations.id),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [unique("api_rate_limits_org_window_unique").on(t.orgId, t.windowStart)]
);

// Org-registered webhook URLs for outbound CFDI status events (#70).
// `secret` signs every delivery to that URL (HMAC-SHA256, see
// webhookDelivery.ts) — generated at creation, shown in the create
// response, never echoed back on GET.
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per delivery attempt-sequence to a webhook_subscriptions row
// (#70) — `status` and `attempts` are the "inspectable... ideally a status
// field" the ticket asks for, beyond the delivery attempt log lines.
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  subscriptionId: text("subscription_id").notNull().references(() => webhookSubscriptions.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

// Async job tracking for `POST /api/v1/pedimentos` (#52) — pedimento parsing
// runs in the background; clients poll `GET /api/v1/jobs/{id}` through
// pending -> processing -> done/failed. `pedimentoId` is set once a `done`
// job resolves (including a `duplicate` resolution, which points at the
// pre-existing pedimento rather than erroring).
export const pedimentoJobs = pgTable("pedimento_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  status: text("status").notNull().default("pending"),
  sourceFilename: text("source_filename").notNull(),
  pedimentoId: text("pedimento_id").references(() => pedimentos.id),
  duplicate: boolean("duplicate").notNull().default(false),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

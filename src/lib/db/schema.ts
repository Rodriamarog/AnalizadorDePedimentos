import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";

// Keyed by the Clerk organization id (e.g. "org_xxx"). Clerk remains the
// source of truth for membership/roles; this table only holds app-specific
// data Clerk doesn't store.
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  facturapiKeyEncrypted: text("facturapi_key_encrypted"),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  facturaNumero: text("factura_numero"),
  fechaPedimento: date("fecha_pedimento"),
  fechaEntrada: date("fecha_entrada"),
  // Fecha de pago (from the pedimento's "FECHAS" box) and the 3-digit
  // "CLAVE DE LA SECCION ADUANERA DE DESPACHO" (aduana + sección) — shown on
  // facturas linked to this pedimento, alongside the pedimento number.
  fechaPago: date("fecha_pago"),
  claveAduana: text("clave_aduana"),
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
// ubicación is picked from here. Any saved address can be used as either
// Origen or Destino — no type/direction tagging.
export const direcciones = pgTable("direcciones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
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

// ── Global reference tables (shared across all tenants, no RLS) ────────────

export const satClaves = pgTable("sat_claves", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const satUnidades = pgTable("sat_unidades", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

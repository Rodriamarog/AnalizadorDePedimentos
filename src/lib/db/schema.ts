import {
  boolean,
  doublePrecision,
  integer,
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
    claveProdServ: text("clave_prod_serv").notNull(),
    descripcionSat: text("descripcion_sat"),
    unitKey: text("unit_key").notNull().default("H87"),
    confidence: text("confidence"),
    facturapiId: text("facturapi_id"),
  },
  (t) => [unique("productos_org_fraccion_unique").on(t.orgId, t.fraccion)]
);

export const facturas = pgTable("facturas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  facturapiId: text("facturapi_id").notNull(),
  uuid: text("uuid"),
  pedimentoId: text("pedimento_id").references(() => pedimentos.id),
  status: text("status").notNull(),
  cancellationStatus: text("cancellation_status").notNull().default("none"),
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

# FacturAPI — Endpoints Relevant to This Project

## Tier 1 — Core (used constantly)

| Endpoint | Why |
|----------|-----|
| `POST /customers` | Register buyers before invoicing them |
| `POST /products` | Build a catalog from imported goods (partidas) |
| `POST /invoices` | Create the CFDI when selling imported merchandise |
| `POST /invoices/preview/pdf` | Preview before stamping — confirmed working in sandbox |
| `GET /invoices/{id}/{format}` | Download PDF / XML / ZIP for the client |
| `POST /invoices/{id}/email` | Send invoice directly to the buyer |
| `DELETE /invoices/{id}` | Cancel with motive codes |

## Tier 2 — High relevance (specific to import business)

### `GET /catalogs/comercioexterior/2.0/tariff-fractions`
Search SAT tariff fractions by code prefix (e.g. `q=8471`). Relevant because the pedimento
parser already extracts `fraccion_arancelaria` from every partida — this endpoint can be used
to auto-fill product descriptions when creating products from partidas.

### `POST /invoices` with Complemento de Comercio Exterior
If a CFDI needs to reference the pedimento, the spec has a full `ComercioExteriorDataInput`
schema. The data the parser already produces maps almost 1:1:

| Parser field | Complement field |
|---|---|
| `pedimento_num` | `ClaveDePedimento` |
| `tipo_cambio` | `TipoCambioUSD` |
| `sum(val_aduana) / tipo_cambio` | `TotalUSD` |
| `fraccion` | `Mercancias[].FraccionArancelaria` |
| `cantidad` | `Mercancias[].CantidadAduana` |
| `precio_unitario` | `Mercancias[].ValorUnitarioAduana` |
| `val_aduana / tipo_cambio` | `Mercancias[].ValorDolares` |

## Tier 3 — Situational

| Endpoint | When you'd need it |
|----------|-------------------|
| `GET /tools/tax_id_validation` | Validate a buyer's RFC before creating them |
| `GET /catalogs/units` | Look up unit codes (H87=Pieza, etc.) |
| `GET /catalogs/products` | Find SAT ClaveProdServ for a product description |
| `POST /invoices/{id}/stamp` | If using the draft → review → stamp workflow |
| `GET /check` | Health check (real path — NOT `/health`) |

## Skip for now
Receipts, retentions, carta porte catalogs, organizations/team management, webhooks.
None of these fit a straightforward import comercializadora workflow.

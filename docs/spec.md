# Product Spec — Analizador de Pedimentos

## What this is

A web tool for a Mexican comercializadora (importer). It does two things:
1. Parse PDF pedimentos → extract partidas, compute prices, export Excel
2. Generate CFDIs (via FacturAPI) from that data, manage customers and invoices

Single user (the owner). Runs on a home server, exposed to the internet via Cloudflare Tunnel.

---

## Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python) |
| PDF parsing | pdfplumber |
| Excel export | openpyxl |
| Invoicing | FacturAPI v2 REST API |
| Frontend | Vanilla JS, no build step |
| Styling | CSS variables, Inter + Plus Jakarta Sans |
| Database | SQLite via SQLModel |
| Deployment | Cloudflare Tunnel (`cloudflared`) |
| Auth | Cloudflare Access (Google/email OTP — no login page needed in the app) |

---

## Deployment

The app runs as a `uvicorn` process on the home server. Choose a port that is free on that machine (check with `ss -tlnp` or `lsof -i :<port>`) — do not assume 8000 is available.

```bash
uvicorn backend.main:app --host 127.0.0.1 --port <PORT>
```

A Cloudflare Tunnel (`cloudflared`) points to `http://127.0.0.1:<PORT>`. The tunnel is configured in the Cloudflare Zero Trust dashboard and exposes the app at a public hostname (e.g. `pedimentos.yourdomain.com`) over HTTPS automatically.

Cloudflare Access is applied to that hostname to require authentication (Google OAuth or email OTP) before any request reaches the server. No auth code lives in the app itself.

---

## Sections (sidebar nav)

### 1. Pedimentos
**Already built.** Upload a PDF, see the partidas table, export Excel.
- Add a "Facturar" button that pre-fills the invoice form from the parsed data
- Filter: Todas / Con incrementables / Sin incrementables

### 2. Clientes
Manage the buyer list (backed by FacturAPI `/customers`).
- List view: search by RFC or name
- Create / edit customer form: legal_name, tax_id (RFC), tax_system, address (zip minimum), email
- RFC validation before save (`GET /tools/tax_id_validation`)

### 3. Facturas
All issued CFDIs (backed by FacturAPI `/invoices`).
- List view: date, customer name, total, status badge (valid / canceled)
- Per-invoice actions: download PDF, download XML, send by email, cancel
- Cancel flow: pick motive (01–04), optionally link substitution invoice
- Filter by status, date range, customer

### 4. Complementos de Pago
Issue a CFDI tipo "P" when a PPD invoice gets paid.
- Only relevant when original invoice was `payment_method: PPD`
- Form: pick the original invoice, enter payment date, amount, form of payment, exchange rate if applicable
- Backed by `POST /invoices` with `type: "P"` and the payment complement

### 5. Productos *(elevated priority — required for fracción → ClaveProdServ mapping)*
Local catalog that maps fracción arancelaria (from pedimentos) to ClaveProdServ (required for CFDI).

These are two completely different classification systems — the customs tariff code on a pedimento
cannot be used directly as the SAT product/service code on an invoice. There is no automatic
conversion; the mapping must be set once per product type and then reused.

- First time a fracción appears: prompt the user to search for and assign a ClaveProdServ
- Save the mapping locally so future pedimentos with the same fracción pre-fill automatically
- Optionally synced to FacturAPI `/products` so the product catalog stays consistent
- Fields per product: fraccion_arancelaria, descripcion, clave_prod_serv, unit_key, price (optional default)

---

## Key user flows

### Flow A: Pedimento → Invoice
1. Upload PDF in Pedimentos
2. Review partidas table
3. Click "Facturar"
4. Select or create customer
5. Confirm line items (pre-filled from partidas)
   - For each partida, ClaveProdServ is auto-filled if the fracción is known
   - If fracción is new, user is prompted to search and assign a ClaveProdServ (saved for next time)
6. Choose payment_form and payment_method (PUE or PPD)
7. Preview PDF
8. Stamp → CFDI issued
9. Download or email to customer

### Flow B: Manage invoice after the fact
1. Go to Facturas
2. Find invoice by customer or date
3. Download PDF/XML, or send by email, or cancel

### Flow C: Register payment (PPD only)
1. Go to Complementos de Pago
2. Select the unpaid PPD invoice
3. Fill payment details
4. Issue CFDI tipo "P"

---

## Comercio Exterior complement (future)

If the business needs CFDIs that reference the pedimento itself (e.g. for exports or specific SAT requirements), the parser already produces all the fields needed:

| Parser output | CE complement field |
|---|---|
| `pedimento_num` | `ClaveDePedimento` |
| `tipo_cambio` | `TipoCambioUSD` |
| `fraccion` | `Mercancias[].FraccionArancelaria` |
| `cantidad` | `Mercancias[].CantidadAduana` |
| `precio_unitario` | `Mercancias[].ValorUnitarioAduana` |
| `val_aduana / tipo_cambio` | `Mercancias[].ValorDolares` |

Not in scope for the initial build.

---

## What's built vs what's left

| Thing | Status |
|---|---|
| PDF parsing (parser.py) | Done |
| Excel export | Done |
| Pedimentos UI (table, filters, export button) | Done |
| FacturAPI endpoint exploration (test_facturapi.py) | Done |
| SQLite DB + SQLModel schema | Not started |
| Sidebar nav + section routing | Not started |
| Clientes section | Not started |
| Facturas section | Not started |
| Complementos de Pago section | Not started |
| Productos section (fracción → ClaveProdServ mapping) | Not started |
| "Facturar" button on pedimento view | Not started |
| Backend routes for FacturAPI proxy | Not started |
| Cloudflare Tunnel setup | Not started (deployment step) |
| Cloudflare Access policy | Not started (deployment step) |

---

## Database schema

SQLite via SQLModel. Customers and products in FacturAPI are the source of truth — not mirrored locally, except for the fracción→ClaveProdServ mapping table.

```
pedimentos
  id                 integer  PK
  pedimento_num      text
  importador         text
  tipo_cambio        float
  pdf_filename       text
  fecha_upload       datetime

partidas
  id                 integer  PK
  pedimento_id       integer  FK → pedimentos
  sec                integer
  fraccion           text        -- 8-digit customs tariff code
  descripcion        text
  cantidad           float
  val_aduana         integer
  val_comercial      integer
  precio_unitario    float       -- val_aduana / cantidad
  tiene_incrementables  bool

productos
  id                 integer  PK
  fraccion           text  UNIQUE  -- 8-digit customs tariff code (natural key)
  descripcion        text        -- default description for this product type
  clave_prod_serv    text        -- SAT UNSPSC code for CFDI
  unit_key           text        -- SAT unit code (default: H87 = Pieza)
  facturapi_id       text        -- nullable, set if synced to FacturAPI /products

facturas
  id                 integer  PK
  facturapi_id       text
  uuid               text        -- SAT UUID
  pedimento_id       integer  FK → pedimentos  (nullable)
  status             text        -- valid / canceled / pending / draft
  cancellation_status  text
  payment_method     text        -- PUE or PPD
  total              float
  currency           text
  customer_name      text        -- denormalized for display
  customer_tax_id    text        -- denormalized for display
  serie              text
  folio_number       integer
  fecha              datetime
  created_at         datetime

complementos_pago
  id                 integer  PK
  facturapi_id       text
  uuid               text
  factura_id         integer  FK → facturas
  fecha_pago         date
  monto              float
  forma_pago         text        -- SAT payment form code
  tipo_cambio        float       -- nullable, only if paid in foreign currency
  created_at         datetime
```

---

## Open questions

- FacturAPI live key setup: the app needs the owner's organization's CSD certificate uploaded to FacturAPI before real CFDIs can be stamped
- Which domain/subdomain to use for the Cloudflare Tunnel
- Which Google account your dad will use to authenticate via Cloudflare Access

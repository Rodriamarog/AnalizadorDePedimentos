# Tasks

Updated after each phase completes.

---

## Phase 0 — Done ✅
- [x] PDF parsing (`backend/parser.py`)
- [x] Excel export (`POST /export`)
- [x] Pedimentos UI (table, filters, export button)
- [x] SQLModel schema (`backend/models.py`, `backend/database.py`)
- [x] Deployed to `windows-mini-pc` at `pedimentos.neurocrow.com`

---

## Phase 1 — Foundation: DB + FacturAPI client ✅
- [x] Add `python-dotenv` to `requirements.txt`, load `.env` in `backend/main.py`
- [x] Modify `POST /parse` to persist `Pedimento` + `Partida` rows to SQLite
- [x] Add `GET /pedimentos` and `GET /pedimentos/{id}` routes
- [x] Create `backend/facturapi.py` with async HTTP client
- [x] Create `deploy.sh`
- [x] Deploy to Windows server, copy `.env`

---

## Phase 2 — Frontend: Sidebar nav + routing ✅
- [x] Add sidebar (left rail, navy, gold active accent)
- [x] Client-side hash router (`navigate(section)`)
- [x] Wrap existing pedimentos UI in `<section id="sec-pedimentos">`
- [x] Add stub sections for Clientes, Productos, Facturas, Complementos
- [x] Grid layout: 220px sidebar + 1fr content

---

## Phase 3 — Productos: fracción → ClaveProdServ mapping ✅
- [x] `GET/POST/PUT/DELETE /productos` backend routes
- [x] `GET /catalogs/products?q=` proxy to FacturAPI
- [x] `GET /catalogs/units?q=` proxy to FacturAPI
- [x] Productos section UI: mapping table, add/edit/delete, live ClaveProdServ search with graceful fallback

---

## Phase 4 — Clientes ✅
- [x] `GET/POST/PUT /clientes` proxy routes (FacturAPI `/customers`)
- [x] Clientes section UI: search bar, customer table, create/edit form

---

## Phase 5 — Facturas + "Facturar" flow ✅
- [x] `GET/POST /facturas` proxy routes, persist to local `factura` table
- [x] `GET /facturas/{id}/pdf`, `/xml`, cancel routes
- [x] `POST /facturas/preview` proxy
- [x] "Facturar" button on Pedimentos section → invoice creation panel
- [x] Pre-fill line items from partidas, ClaveProdServ lookup per fracción
- [x] Customer picker, payment_form/method selectors, PDF preview, stamp
- [x] Facturas section UI: list, filters (PUE/PPD), PDF/XML download, cancel modal

---

## Phase 6 — Complementos de Pago ✅
- [x] `POST /complementos` route (CFDI tipo "P"), persist to `complementopago` table
- [x] `GET /complementos` route
- [x] Complementos section UI: PPD invoice list, "Registrar pago" form, issued complementos list with PDF/XML links
- [x] Auto-calculates IVA 16% base on payment amount

---

## Phase 7 — Deploy sync
- [ ] Create `deploy.sh` (scp + restart uvicorn on Windows server)
- [ ] Run after each phase

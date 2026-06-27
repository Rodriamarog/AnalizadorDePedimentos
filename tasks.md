# Migration Plan: Vanilla JS → Vite + React + shadcn/ui

Single source of truth for the rewrite. Work phases sequentially; each phase should leave the app in a runnable state.

---

## Phase 1 — Project Scaffold

- [x] Run `npm create vite@latest frontend-react -- --template react-ts` alongside the existing `frontend/` dir
- [x] Install and configure Tailwind CSS v4
- [x] Run `npx shadcn@latest init` (default style, default base color)
- [x] Install `sweetalert2` — works as-is with React/Vite, no wrapper needed
- [x] Add shadcn components needed across the whole app:
  - `button`, `badge`, `card`, `input`, `select`, `table`, `dialog`, `sheet`, `command`, `popover`, `separator`, `progress`
- [x] Configure the dev proxy in `vite.config.ts` to forward `/api` (or all non-asset requests) to the FastAPI backend so `fetch('/parse')` etc. work unchanged
- [x] Verify `npm run dev` loads a blank page without errors

---

## Phase 2 — App Shell & Navigation

- [x] Create `src/App.tsx` with a top bar and a sidebar
- [x] Sidebar has five nav items: Pedimentos, Productos, Clientes, Facturas, Complementos
- [x] Active section driven by a `useState<Section>` (or `useReducer`) at the top level — no router needed
- [x] Each section renders a placeholder `<div>` for now
- [x] Confirm layout matches the original: fixed topbar, sidebar left, scrollable content right

---

## Phase 3 — Pedimentos Section (core flow)

- [x] `<UploadZone>` — drag-and-drop + click-to-select, calls `POST /parse`, shows spinner while loading (shadcn `Skeleton` or a spinner)
- [x] `<PedimentosHistory>` — fetches `GET /pedimentos`, renders a shadcn `Table` with Ver / Eliminar actions; "Subir nuevo" button returns to upload zone
- [x] `deletePedimento` — `Swal.fire()` confirmation, same as current
- [x] `<PedimentoInfoBar>` — info strip shown after a pedimento loads (pedimento number, importador, back button)
- [x] `<StatCards>` — three shadcn `Card` components: total partidas, con incrementables, sin incrementables
- [x] `<PartidasTable>` — shadcn `Table` rendering all `partidas`; columns: Partida, Descripción, Valor de Aduana, Piezas, T.C., P.U USD, Valor Dlls, P.U MN, ClaveProdServ, Unidad
  - Highlighted rows for `tiene_incrementables` using a subtle bg variant
- [x] Filter toolbar (Todas / Con incrementables / Sin incrementables) using shadcn `ToggleGroup` or simple `Button` variants
- [x] "Exportar Excel" button calls `POST /export` and triggers download (logic is identical to current)

---

## Phase 4 — Inline Clave & Unit Comboboxes

This is the most complex piece; isolated into its own phase.

- [x] `<ClaveCell>` — a shadcn `Popover` + `Command` component per row
  - Debounced input triggers `GET /catalogs/products?q=...`
  - Shows key + description in the dropdown list
  - On select: updates the cell, persists via `POST /productos` or `PUT /productos/:fraccion`
  - Visual states: unmapped (default), mapped (green border), conf-medium (amber), conf-low (red) — via Tailwind classes
  - `confidenceMap` stored in parent state; review badge shown when medium/low
- [x] `<UnitCell>` — same pattern but hits `GET /catalogs/units?q=...`
  - On select: calls `saveClaveMapping` to persist `unit_key`
- [x] `refreshProductosMap()` → a `fetchProductosMap()` util that returns the map; called after upload, automap, and page load
- [x] Wire both cells into `<PartidasTable>` rows

---

## Phase 5 — Productos Section

- [x] `<ProductosSection>` fetches `GET /productos` on mount and on return from modal
- [x] shadcn `Table` with columns: checkbox, Fracción, Descripción, ClaveProdServ, Descripción SAT, Unidad, actions
- [x] Select-all checkbox + per-row checkboxes; bulk delete bar appears when any row is checked
- [x] `<ProductoDialog>` (shadcn `Dialog`) — add / edit form
  - Fields: Fracción (disabled on edit), Descripción, ClaveProdServ (with `Command` autocomplete), Unidad (with `Command` autocomplete)
  - Save → `POST /productos` or `PUT /productos/:fraccion`
- [x] Delete single → `Swal.fire()` confirmation
- [x] Bulk delete → `Swal.fire()` confirmation

---

## Phase 6 — Clientes Section

- [x] `<ClientesSection>` with search bar (`Input` + `Button`) — fetches `GET /clientes?q=...`
- [x] shadcn `Table`: Nombre fiscal, RFC, Régimen, Email, Editar button
- [x] `<ClienteDialog>` (shadcn `Dialog`) — add / edit form
  - Fields: Nombre fiscal, RFC (disabled on edit), Código postal, Régimen fiscal (`Select`), Email
  - Save → `POST /clientes` or `PUT /clientes/:id`

---

## Phase 7 — Facturas Section

- [x] `<FacturasSection>` fetches `GET /facturas?limit=100` on mount and on filter change
- [x] Payment method filter (`Select`: Todos / PUE / PPD)
- [x] shadcn `Table`: Folio, Cliente, RFC, Total, Fecha, Método (Badge), Status (Badge), actions
- [x] PDF / XML links open in new tab (same `/facturas/:id/pdf` routes)
- [x] `<CancelDialog>` (shadcn `Dialog`) — motivo de cancelación `Select` + confirm button
  - On confirm → `DELETE /facturas/:id?motive=...`; errors via `Swal.fire()`

---

## Phase 8 — Complementos Section

- [x] `<ComplementosSection>` calls two loaders: PPD pending + issued complementos
- [x] PPD pending table (`GET /facturas?payment_method=PPD&limit=100`, filter `status === 'valid'`): Folio, Cliente, Total, Fecha, "Registrar pago" button
- [x] `<PagoDialog>` (shadcn `Dialog`): fecha de pago, monto, forma de pago → `POST /complementos`
- [x] Issued complementos table (`GET /complementos`): Fecha pago, Monto, Forma pago, UUID, PDF/XML links
- [x] "Actualizar" button reloads both tables

---

## Phase 9 — Facturar Panel

- [x] "Facturar" button in the Pedimentos toolbar opens a shadcn `Sheet` (side panel) or full `Dialog`
- [x] Customer selector — shadcn `Select` populated from `GET /clientes`
- [x] Items table — one row per partida with editable: checkbox, Descripción (`Input`), Cantidad (`Input`), Precio MXN (`Input`), ClaveProdServ (`Input`), Unidad (`Input`)
  - Select-all checkbox
  - Warning icon on rows without a ClaveProdServ mapping
- [x] Payment method toggle (PUE / PPD) using `Button` variants; updates the "Forma de pago" select accordingly
- [x] Forma de pago — shadcn `Select`
- [x] "Vista previa PDF" → `POST /facturas/preview` → opens blob URL
- [x] "Timbrar factura" → `POST /facturas` → success/error `Swal.fire()`

---

## Phase 10 — Automap Overlay

- [x] "Autocompletar SAT" button triggers `POST /pedimentos/:id/automap`
- [x] Full-screen overlay (shadcn `Dialog` without close button, or a fixed `div`) shown during the request
- [x] shadcn `Progress` bar animated through faked steps (same timing as current implementation)
- [x] Cycling status messages via `setInterval`
- [x] On success: update `confidenceMap` state, re-render partidas table, show result summary via `Swal.fire()`
- [x] On error: show `Swal.fire()` with error message

---

## Phase 11 — Wiring & Cleanup

- [x] Verify all `fetch()` calls go through the Vite proxy correctly in dev; confirm production build path
- [x] Replace the existing `frontend/` with `frontend-react/` (or update the FastAPI static mount to point at the new `dist/`)
- [ ] Smoke-test every section end-to-end against the live backend
- [ ] Delete `frontend/index.html` and the old `dist/`

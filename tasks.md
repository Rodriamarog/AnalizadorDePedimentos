# Migration Plan: Multi-tenant Next.js rewrite

Single source of truth for turning `pedimentosV2` into the multi-tenant replacement for the old
FastAPI/SQLite app (`AnalizadorDePedimentos`). Work phases sequentially; each phase should leave
the app in a runnable state.

Stack: Next.js (self-hosted, Node runtime) + Postgres (self-hosted via Docker) + Drizzle ORM +
Clerk (Organizations for tenancy) + Row-Level Security.

---

## Phase 1 — Infra: Postgres + Drizzle + Clerk wiring

- [x] Add a `docker-compose.yml` running `postgres` with a named volume for persistence
      (host port 5435 — 5432 is already taken by a native Postgres on this machine)
- [x] Install `drizzle-orm`, `drizzle-kit`, `pg`
- [x] Add `src/lib/db/schema.ts`, `drizzle.config.ts`, `.env.local` with `DATABASE_URL`
- [x] Create `src/lib/db/client.ts` — pooled `pg.Pool` + drizzle instance
- [x] Create `src/lib/db/withOrg.ts` — transaction helper that runs
      `select set_config('app.org_id', $1, true)` then the callback, so every query is
      tenant-scoped by construction
- [x] Install `@clerk/nextjs`; create Clerk project, enable Organizations **(user action needed:
      paste real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` into `.env.local`)**
- [x] Wire `ClerkProvider` in `src/app/layout.tsx` + `src/proxy.ts` (this Next.js version renamed
      `middleware.ts` → `proxy.ts`); gate all routes behind sign-in + an active organization
      (`/select-org` for org picker/creation, `/sign-in`, `/sign-up`)
- [x] Verify against a real Clerk project: signed-in user with no org gets redirected to
      `/select-org`; with an org, reaches the dashboard shell (Organizations enabled on the
      instance via `clerk enable orgs --force-selection`, confirmed working by user)
- [ ] Note for Phase 2: creating an org in Clerk doesn't create a row in our local
      `organizations` table — need a lazy-upsert-on-first-request or a Clerk webhook before any
      tenant table FK insert can succeed

---

## Phase 2 — Schema + RLS

- [x] `organizations(id text PK, facturapi_key_encrypted text, plan text, created_at)` — `id` is
      the Clerk org id
- [x] `pedimentos`, `partidas`, `productos`, `facturas`, `complementos_pago` — all get
      `org_id text NOT NULL REFERENCES organizations(id)`
  - [x] `productos` is per-org: `unique(org_id, fraccion)` (not globally unique)
- [x] `sat_claves`, `sat_unidades` — stay global/shared, no `org_id`, no RLS
- [x] Enable RLS + `USING` and `WITH CHECK` policies (`org_id = current_setting('app.org_id', true)`)
      on every tenant table (`drizzle/0001_rls.sql`)
- [x] **Non-superuser app role.** `POSTGRES_USER` from docker-compose is a superuser, and
      superusers always bypass RLS — `FORCE ROW LEVEL SECURITY` has no effect on them either. Had
      to add `drizzle/0003_app_role.sql` creating `app_user` (non-superuser, `NOBYPASSRLS`) and
      point the app's runtime connection (`APP_DATABASE_URL` in `.env.local`,
      `src/lib/db/client.ts`) at that role. `DATABASE_URL` (the superuser) is now admin/migration
      -only — never used by app code.
- [x] `src/lib/db/withOrg.ts` — now also upserts the Clerk org into the local `organizations`
      table on every call (`onConflictDoNothing`), closing the Phase 1 loose end about Clerk org
      creation not syncing to Postgres
- [x] Postgres full-text search on `sat_claves`/`sat_unidades` (`drizzle/0002_fts.sql`,
      `tsvector` + GIN, replaces the old SQLite FTS5 setup) — verified with a live query
- [x] Migration script: seed `sat_claves`/`sat_unidades` from the old SQLite data
      (`scripts/seed-sat-catalogs.sh`, `npm run db:seed`) — row counts match the old DB exactly
      (52,513 / 2,418)
- [x] Cross-org isolation test (`scripts/test-rls-isolation.ts`, `npm run db:test-rls`): insert as
      org A, assert org B can't read or write it. **First run caught a real leak** (missing
      `FORCE ROW LEVEL SECURITY`), second run caught a second real leak (superuser bypassing RLS
      regardless of FORCE) — both fixed, now passes
- [x] `npm run db:migrate` runs the full chain (push → RLS → FTS → app role) idempotently;
      verified against a fully wiped Docker volume (`docker compose down -v && up -d`) — clean
      reproducible setup, not just "worked once"

---

## Phase 3 — Pedimentos core flow

- [x] **Text extraction approach changed from the original plan.** `pdfjs-dist`'s raw text items
      are in PDF content-stream order, not visual reading order — for this form-style layout that
      scrambled the output completely (verified live, not assumed) and the regex-based parser
      depends entirely on reading order. Switched to shelling out to `pdftotext -layout` (Poppler,
      already installed on this machine) via `node:child_process`, which reconstructs reading
      order the same way `pdfplumber.extract_text()` did. Fine for self-hosted deployment (not
      serverless); **requires `poppler-utils` on the host** — note this for the deploy checklist
      in Phase 10.
- [x] Port `backend/parser.py` → `src/lib/parser.ts` — 1:1 port of the cleaning/regex/token logic;
      the only real porting risk was text extraction fidelity (see above), not the parsing logic
      itself
  - [x] Validated against the real sample PDF (`6000505 PAGADO.pdf`, 21 pages, 56 partidas) two
        ways:
    - Diffed full output field-by-field against the actual Python parser's output for the same
      file (`scripts/test-parser.ts`) — **all 56 partidas match exactly** on every field
      (fraccion, cantidad, valAduana, valComercial, precioUnitario, tieneIncrementables, umc,
      descripcion). Only mismatch: `importador` has one extra space after `CURP:` — a genuine,
      expected difference between how `pdftotext -layout` (preserves visual column gaps) and
      `pdfplumber` (word-clustering) space out text; cosmetic, in a free-text field, not chased
      further.
    - Ported `tests/test_parser.py`'s actual assertions to TS (`scripts/test-parser-assertions.ts`)
      — all pass (pedimento_num, importador substring, total partida count, first/multiline/
      page-break partidas, tiene_incrementables invariant, precio_unitario formula, last partida)
    - Found and fixed **two real bugs** this way: (1) `parseCuadroLiquidacion`'s `^DTA` anchor
      broke because `-layout` preserves leading column-indentation whitespace that `pdfplumber`
      didn't produce — fixed by left-trimming each line before building `fullText`; (2) initially
      all three (dta/igi/prv) came back null until that fix
    - Verified non-pedimento PDFs don't throw, just return an empty/zero result (matches Python
      behavior) — tested against `CFDI40_VistaPrevia (1).pdf`
  - [x] Removed the unused `pdfjs-dist` dependency after switching approaches
- [x] `POST /api/parse` route (`src/app/api/parse/route.ts`) — 20MB cap, `.pdf`-only check, temp
      file cleanup, dedup-by-`pedimento_num` (returns existing record with `_duplicate: true`
      instead of re-inserting, same as the old app), persists `pedimento` + `partidas` scoped to
      the caller's org via `withOrg`
- [x] `GET /api/pedimentos` (list + partida counts via join), `GET /api/pedimentos/[id]` (detail +
      partidas), `DELETE /api/pedimentos/[id]` — all org-scoped via `withOrg`
- [x] `src/lib/auth.ts` — `requireOrgId()` helper; defense-in-depth even though the proxy already
      gates all `/api/*` routes behind an active org
- [x] Full integration test (`scripts/test-parse-integration.ts`, bypasses HTTP/Clerk but exercises
      the exact same parser → `withOrg` → Drizzle code path as the real routes): parse → persist →
      list shows 1 row → detail shows 56 partidas → re-parsing same PDF doesn't duplicate → delete
      removes it. All pass.
- [x] Pedimentos UI (`(dashboard)/pedimentos/page.tsx`, `(dashboard)/pedimentos/[id]/page.tsx`) —
      replaced the hardcoded mock table with real data: upload button (drag-and-drop not
      implemented, click-to-select only), history table, detail view with partidas table
      (incrementable rows highlighted), delete with confirm. Kept the existing shadcn visual style
      rather than reinventing it.
- [x] **Grid parity fix.** First pass didn't match the old `frontend/index.html` columns/features —
      read the old markup directly (`grep`'d for `<th>`/table structure) and matched it exactly:
  - List page: added explicit Ver/Eliminar buttons (not just a link), whole row still clickable,
    `T.C.` formatted `.toFixed(4)`, `Fecha` formatted `es-MX` day/short-month/year (was plain
    `toLocaleDateString`), delete confirm text matches original wording
  - Detail page: stat cards changed from (Partidas/T.Cambio/DTA-IGI/PRV) to the original's
    (Total partidas / Con incrementables / Sin incrementables) — DTA/IGI/PRV aren't shown here in
    the original either, they're used later in the Facturas flow, not this view
  - Added the filter toolbar (Todas / Con incrementables / Sin incrementables), client-side filter
    over the same partidas array
  - Partidas table expanded from 6 columns to the original's 10: Partida, Descripción, Valor de
    Aduana, Piezas, Tipo de Cambio, P.U USD, Valor Dlls, P.U MN, ClaveProdServ, Unidad — with the
    same derived-value formulas (`P.U USD = P.U MN / tc`, `Valor Dlls = valAduana / tc`)
  - `ClaveProdServ`/`Unidad` columns are present but show `—` for now — the original populates
    them from the `productos` fracción-mapping table, which doesn't exist in this app until Phase
    5. Column layout matches now; the live mapping/autocomplete UI is deferred, not skipped.
  - **Deliberately deferred** (user chose to keep scoped): the "Exportar Excel" button/endpoint —
    stays in Phase 8 as originally planned, not pulled forward
- [x] **Density/width fix.** The 10-column detail table needed horizontal scroll — the original
      never does, because it uses the full content width (no max-width wrapper) plus a
      tighter table (`font-size: .8rem` body / `.7rem` header, `.6-.65rem .75rem` cell padding).
      Removed `max-w-5xl mx-auto` from both pedimentos pages (was capping content at 1024px inside
      an already-narrower sidebar layout), shrank the partidas table to `text-xs`/10px headers
      with `px-2.5 py-2` cells, and added `whitespace-nowrap` to the narrow numeric/label columns
      so only the Descripción column wraps. `overflow-x-auto` kept as a fallback (the original
      keeps the same fallback on `.table-wrap`), not relied on in normal cases.
- [x] `npx tsc --noEmit`, `npm run lint` (only pre-existing unrelated finding remains), and
      `npm run build` all clean after the grid-parity fix
- [x] **User verified in browser**: upload, list, detail, dedup, delete, and the grid-parity/width
      fixes all confirmed working through the actual UI/Clerk session

---

## Phase 4 — Postgres full-text search for SAT catalogs

- [x] `tsvector` + GIN indexes already existed from Phase 2 (`drizzle/0002_fts.sql`) — this phase
      was just the API layer on top
- [x] `src/lib/satSearch.ts` — ported the old `_norm`/`_fts_search`/`_build_fts_query` logic from
      `backend/main.py` 1:1:
  - Key-prefix match first (`key LIKE 'q%'`) for bare alphanumeric queries — products: any length;
    units: capped at ≤5 chars, uppercased (matches the old gate exactly)
  - Falls back to full-text search: accent-stripped (NFD normalize + strip combining marks,
    porting Python's `unicodedata` filter), tokenized into `[a-z]{2,}` words, built into a
    Postgres `tsquery` with prefix matching per word (`word:*`), ranked by `ts_rank` — the
    `tsvector`/`ts_rank` equivalent of the old FTS5/bm25 approach
  - Kept the AND-first/OR-fallback vs. OR-only (`preferOr`) branching from the original even
    though both current call sites use `preferOr: true` — the AND path is what Phase 7's automap
    will need (it used `prefer_or=False` in the old app), so this is porting the shared helper
    once rather than duplicating it later
  - Final fallback to plain `ILIKE` on `description` if the tsquery path throws, matching the old
    code's exception handling
- [x] `GET /api/catalogs/products?q=`, `GET /api/catalogs/units?q=` — same query-length gates as
      the old endpoints (`q.length < 2` for products, `< 1` for units), org-gated via
      `requireOrgId()` (global catalogs, no RLS/org_id on the tables themselves)
- [x] Verified against real seeded data (`scripts/test-sat-search.ts`): key-prefix match, accent-
      insensitive free-text search (`camion` and `camión` return identical results), short-query
      gates, and unit lookup by key (`h87` → `H87`) and by free text — all pass. (Caught my own
      test bug along the way: `8471` doesn't exist as a key prefix in this dataset — not a search
      bug, just a bad example code; swapped to `2410`, a code confirmed present.)
- [x] `npx tsc --noEmit`, `npm run lint` (only pre-existing unrelated finding), `npm run build` all
      clean; confirmed the new routes are properly auth-gated (307 redirect when unauthenticated)

---

## Phase 5 — Productos (fracción → ClaveProdServ mapping, per-org)

- [x] `GET/POST/PUT/DELETE /api/productos`, `GET/PUT/DELETE /api/productos/[fraccion]` — org-scoped
      via `withOrg`; `POST` 409s on duplicate fracción (matches old app), `PUT` does a partial
      update (keeps existing values for fields not in the body)
- [x] Added shadcn `popover` and `command` components (pulled in `dialog`/`textarea`/`input-group`
      as their dependencies) — used for the SAT catalog autocomplete instead of porting the old
      app's hand-rolled DOM-positioned dropdown (mouse-tracking, manual position calc). Same UX
      (type-to-search, click-to-select), idiomatic React instead of jQuery-style DOM manipulation.
- [x] `src/components/sat-combobox.tsx` — reusable `<SatComboBox>`: debounced search against
      `/api/catalogs/products` or `/api/catalogs/units`, mapped/confidence-based styling (green =
      mapped, amber = medium confidence, red = low confidence — confidence gets populated by
      Phase 7's automap; manual edits always clear it to `null`, matching the old app's "confidence
      is void once a human overrides it" behavior)
  - Fixed a real `react-hooks/set-state-in-effect` finding here (not suppressed like the two
    earlier ones): restructured so the "clear results for an empty query" case is derived at
    render time (`query ? results : []`) instead of a synchronous `setState` in the effect body
- [x] Standalone Productos page (`(dashboard)/productos/page.tsx`) — replaced the mock table;
      real CRUD table (Fracción/Descripción/ClaveProdServ/Descripción SAT/Unidad) with
      Editar/Eliminar, and an "Agregar producto" dialog using `<SatComboBox>` for the
      clave/unidad fields. **Deferred**: the old app's bulk-select/bulk-delete checkboxes —
      minor feature, not requested, skipped to keep this phase scoped; single-row delete covers
      the common case.
- [x] Wired `<SatComboBox>` into the pedimento detail grid — this is what actually replaces the
      `—` placeholders from Phase 3/the grid-parity fix. Loads the org's `productos` map once,
      renders live comboboxes in the ClaveProdServ/Unidad columns, saves on selection (`PUT` if
      already mapped, `POST` if not — same upsert logic as the old `saveClaveMapping`)
- [x] Integration test (`scripts/test-productos-integration.ts`, bypasses HTTP/Clerk, exercises
      the same Drizzle/`withOrg` path as the routes): create → unique-constraint rejects a
      same-org duplicate fracción → update persists → a *different* org can map the same fracción
      independently (proves per-org scoping, not just uniqueness) → delete. All pass.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean; confirmed `/api/productos` and `/productos` are auth-gated (307 when signed out)
- [ ] **User to verify in browser**: the live autocomplete/mapping UI in the pedimento detail grid
      and the standalone Productos page are inherently a visual/interactive check I can't drive
      from here

---

## Phase 6 — FacturAPI integration (per-org key)

- [x] `src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt (`iv:authTag:ciphertext`, hex-encoded) for
      `organizations.facturapi_key_encrypted`. Master key comes from
      `FACTURAPI_KEY_ENCRYPTION_SECRET` (32 bytes, hex; generated for local dev, a real deployment
      needs its own). Verified the roundtrip directly before building anything on top of it.
- [x] `src/lib/facturapi.ts` — bearer-token HTTP client (`createFacturapiClient(apiKey)`), key
      passed in per call, never a global env var; `FacturapiError` carries the upstream status
      code through to the route handler
- [x] `src/lib/orgFacturapi.ts` — `getOrgFacturapiClient(orgId)`: looks up + decrypts the org's key,
      returns a 400 `NextResponse` if not configured (no RLS on `organizations`, so a plain query
      scoped by `orgId` is correct here, not `withOrg`)
- [x] Org settings UI (`(dashboard)/configuracion/page.tsx` + `/api/settings/facturapi-key`):
      paste/replace the key, never displays it back once saved, just a "configured" checkmark.
      Added `Configuración` and `Complementos` (was missing entirely) to the sidebar.
- [x] `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/[id]` — thin proxy to FacturAPI
      `customers`, matching the old app (no local clientes table either)
- [x] `src/lib/saveFactura.ts` — ported `_save_factura`: upserts a FacturAPI invoice object into
      the local `facturas` table, org-scoped, takes an existing `withOrg` transaction rather than
      opening its own
- [x] `GET/POST /api/facturas`, `POST /api/facturas/preview`, `GET /api/facturas/[id]/pdf`,
      `GET /api/facturas/[id]/xml`, `POST /api/facturas/[id]/email`, `DELETE /api/facturas/[id]`
      (cancel). One behavioral nuance ported deliberately: cancel only *updates* the local mirror
      if it already exists — it never creates one, matching the old app exactly (a separate,
      narrower path than the general upsert `saveFactura` uses elsewhere).
- [x] `GET/POST /api/complementos` — the complex one: looks up the original invoice by ID on
      FacturAPI, computes the IVA base (16%, hardcoded — matches the old app's assumption), strips
      read-only fields off the customer sub-object before resubmitting it inline, builds and posts
      the "payment complement" invoice, then upserts both the invoice and the new complement
      locally. `GET` now also left-joins `facturas` for the list UI (customer name, folio) — the
      old app's plain local-table select didn't need this since its UI cross-referenced separately.
- [x] **Real sandbox verification** (`scripts/test-facturapi-integration.ts`,
      `scripts/test-facturas-full-integration.ts`), reusing the old project's FacturAPI test-mode
      key (`FACTURAPI_TEST_API_KEY`, user-provided): encrypt→store→decrypt round-trip against a
      live client, invalid-key produces a clean 401 `FacturapiError` (not a crash), and a **full
      real round trip** — create customer → create invoice → local upsert → download real PDF/XML
      → send email → create a real complemento de pago → persist it locally → cancel the invoice.
      All against the actual FacturAPI sandbox, not mocks.
  - Hit two real snags during this, both fixed: (1) the old project's example invoice payload
    used `use: "G01"` which the sandbox now rejects for a `tax_system: 616` customer — SAT catalogs
    change over time; switched to `use: "S01"` (always valid). (2) FacturAPI normalizes
    `legal_name` casing in its response — not a bug, just meant the test assertion needed to check
    for a substring instead of exact original-case match.
- [x] Clientes UI: search, list (Nombre fiscal/RFC/Régimen/Email), add/edit dialog (RFC disabled
      once set, matching the old app), delete
- [x] Facturas UI: list (Folio/Cliente/RFC/Total/Fecha/Método/Status badges), payment-method
      filter, PDF/XML download, cancel (with SAT motive codes), and a manual invoice-creation
      dialog (customer select, use/payment form/method, line items with `<SatComboBox>` for
      ClaveProdServ/Unidad)
- [x] Complementos UI: PPD-pending-payment table + "Registrar pago" dialog, and an issued-
      complementos table (joined with factura customer/folio for display)
- [x] **Scope note, not a shortcut**: the old app's "Facturar" panel — generating an invoice
      directly from a pedimento's *mapped partidas* (pulling in the `productos` ClaveProdServ/Unit
      mapping, DTA/IGI/PRV impuestos aduaneros as a line item, optional ISR/IVA retenciones, and a
      searchable pedimento-link picker for manual invoices) — is a large, deeply-integrated feature
      in its own right, not just a form. Building the Facturas page here covers the FacturAPI proxy
      layer end-to-end (verified against the real sandbox) with a manual line-item entry flow, but
      does **not** yet wire pedimentos → productos → facturas together automatically. That
      integration deserves its own focused pass rather than being rushed at the tail of this phase.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean; re-ran the full regression suite from Phases 2–5 (RLS isolation, productos
      integration, SAT search, parser assertions, parse integration) — all still pass; confirmed
      every new route/page is auth-gated (307 when signed out)

---

## Phase 7 — Gemini automap

- [x] Added `@google/genai` (Node SDK); reused the same `GEMINI_API_KEY` from the old project's
      `.env` (per user's explicit "yeah just reuse the same key") — added to `.env.local`
- [x] `src/lib/hsChapters.ts` — ported the ~96-entry `HS_CHAPTERS` dict and `chapterHint()` helper
      from `backend/main.py:161-286` verbatim (generated via a script that parsed the Python dict
      directly, to avoid transcription errors across the accented Spanish text)
- [x] `src/lib/satSearch.ts` — added `searchSatCatalogForAutomap`/`searchSatUnitsForAutomap`: same
      underlying `ftsSearch`, but AND-first (`preferOr: false`) and with the old app's per-tool
      word-length gates (`[a-z]{3,}` for products, `[a-z]{2,}` for units) instead of the
      interactive-search gates. This is exactly the AND path flagged as deferred back in Phase 4.
- [x] `src/lib/automap.ts` — ported the full two-pass agentic loop from `backend/main.py:459-757`:
  - Same two Gemini function-declaration tools (`search_sat_catalog`, `search_sat_units`), same
    `gemini-3.1-flash-lite` model, `temperature: 0`, `thinkingConfig.thinkingBudget: 8192`
  - Same up-to-35-turn tool-calling loop with up-to-2 malformed-JSON retries, same markdown-fence
    stripping + `[...]` extraction before `JSON.parse`
  - Same two-pass strategy: strict first pass (≥3 searches/product, `null` only as last resort),
    then a rescue pass for any nulls (≥4 searches, must pick closest match, confidence forced to
    `medium`/`low` — never `high` on rescued items), same Spanish system prompts word-for-word
  - Returns raw classifications only (no DB access) — the route does the catalog-verification +
    upsert, since that needs `withOrg` and this function doesn't need org context
- [x] `POST /api/pedimentos/[id]/automap` — the one deliberate behavior change from the old app:
      the "already mapped" skip-check now queries the *org's own* `productos` table via `withOrg`
      instead of a single global table (matches the per-org productos model from Phase 5). Verifies
      each returned key against the real `sat_claves` table, downgrading `high`→`medium` confidence
      if the key isn't actually in the catalog (matches old behavior); upserts into `productos` via
      `onConflictDoUpdate` on the `(org_id, fraccion)` unique constraint.
- [x] UI: added an "Autocompletar SAT" button to the pedimento detail page header (same label as
      the old app, confirmed by the user) plus a matching full-screen progress overlay — stepped
      progress bar animation and cycling status messages ("Buscando claves SAT…", "La IA está
      pensando…", etc.), ported 1:1 from the old app's `showAutomapOverlay`/`AUTOMAP_MESSAGES` in
      `frontend/index.html`. On completion, reloads the productos map and shows a result summary
      (mapped/medium-confidence/low-confidence/skipped counts) via `alert()` — consistent with the
      rest of this app's existing convention of using native `confirm()`/no toast library, rather
      than introducing a new dependency for this one flow.
- [x] `scripts/test-automap-integration.ts` — real integration test, **no mocks**: calls the actual
      Gemini API (via `runAutomap`) with two real-world-shaped test partidas (chapter 87 vehicle
      parts, chapter 39 plastics), verifies both come back classified with valid confidence values,
      persists them through the same upsert path the route uses, confirms the rows land correctly
      scoped to a test org, then verifies the "already mapped" path skips a second run entirely
      without calling Gemini again. Ran once for real (not looped, given it's a paid LLM call) —
      passed, returned sensible SAT codes for both test items on the first pass (no rescue needed).
- [x] Re-ran the full regression suite (RLS isolation, SAT search, productos integration) — all
      still pass
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean

---

## Phase 8 — Export

- [x] Added `exceljs`; ported `POST /export` from `backend/main.py:1178-1247` to
      `GET /api/pedimentos/[id]/export` — one deliberate change: instead of the client POSTing
      the already-loaded pedimento JSON back to the server (trusting client-supplied numbers), the
      route re-fetches the pedimento + partidas server-side by `id` via the same `withOrg`-scoped
      query pattern used in `/api/pedimentos/[id]/route.ts`
- [x] `src/lib/exportXlsx.ts` — `buildExportWorkbook(pedimento, partidas)`, factored out of the
      route so the integration test exercises the exact same code the route runs, not a duplicate.
      Ported 1:1 from the old `openpyxl` version: title rows ("Pedimento: X" / "Importador: Y"),
      header row (Partida/Valor de Aduana/Piezas/Tipo de Cambio/P.U USD/Valor Dlls/P.U MN/
      Incrementables) with dark-navy fill + white bold font, same computed per-row columns and
      number formats (`#,##0.00` / `#,##0.00000`), amber fill + thin bottom border on rows with
      incrementables, same column widths
- [x] UI: "Exportar Excel" button (same label as the old app) added to the pedimento detail page
      header, next to "Autocompletar SAT"; downloads the file client-side using the
      `Content-Disposition` filename from the response
- [x] `scripts/test-export-integration.ts` — creates a real pedimento + 2 real partidas (one with
      incrementables, one without) in the DB, generates the workbook via the same
      `buildExportWorkbook` the route calls, **re-reads the resulting buffer back with `exceljs`**
      and asserts on the actual file structure: title cells, header row values, row count, computed
      P.U USD/P.U MN values, and — the one styling detail worth actually checking — that only the
      incrementables row got the amber fill. All pass.
- [x] Re-ran the regression suite (RLS isolation, SAT search, productos integration) — all still
      pass. (Skipped `test-parser-assertions.ts` in this run — it requires a real PDF path as a CLI
      arg and the parser wasn't touched this phase, so it's unrelated to this change.)
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean; confirmed `/api/pedimentos/[id]/export` is auth-gated (307 when signed out)

---

## Phase 9 — Auth/access polish

No old-app equivalent to port here — the old app was single-tenant with simple username/password
auth (`backend/main.py`'s `/auth/login`), no concept of members/roles/invites at all. This phase is
entirely new multi-tenant surface, built on Clerk's own primitives instead of custom code.

- [x] `(dashboard)/organizacion/page.tsx` — new page embedding Clerk's `<OrganizationProfile>`
      (`routing="hash"`) directly; gives members list, invite-by-email, role management
      (admin/member), and pending invitations for free — no custom backend or UI needed, Clerk
      handles all of it against their own API. Added "Organización" to the sidebar nav
      (`app-sidebar.tsx`) between Productos and Configuración.
- [x] Audited every route handler under `src/app/api/**/route.ts` (found via a script that flags
      any route file *not* calling `requireOrgId()`) — zero exceptions, every single one resolves
      `orgId` exclusively via `requireOrgId()` → Clerk's server-side `auth()`. Grepped separately
      for any `body.org_id` / `searchParams.get("org...")` pattern — none exist anywhere in the
      codebase. No client-supplied org id is ever trusted.
- [x] Reviewed `src/proxy.ts` for the "removed from org mid-session" / "stale org in session" edge
      cases raised in the overview: concluded no extra code is needed here. `auth()` reads `orgId`
      from Clerk's signed, server-verified session claims on every request — if a user is removed
      from an org (or the org is deleted), Clerk's own session-claim refresh clears that state, and
      the existing `if (!orgId && !isOrgSelectionRoute...)` redirect in `proxy.ts` already handles
      the resulting "no active org" case correctly. This isn't a gap our app introduced; it's
      Clerk's designed behavior, so nothing to fix.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean; confirmed `/organizacion` is auth-gated (307 redirect when signed out)
- [ ] **User to verify in browser**: creating a second test org, inviting a second user, and
      confirming the switch/isolation loop end-to-end is an interactive, multi-account flow I can't
      drive from here — the `<OrganizationProfile>` UI itself is Clerk's own tested component, but
      the actual invite→accept→switch→see-isolated-data path needs a real second account

---

## Phase 10 — Data migration + cutover

- [ ] One-off script: read the old SQLite DB, create a "default" org, import
      `pedimento`/`partida`/`producto`/`factura`/`complemento_pago` rows into Postgres scoped to
      that org
- [ ] Deploy Postgres (Docker) + Next.js on the home server
- [ ] Point DNS/reverse proxy at the new app, verify parity against old app, decommission old
      FastAPI/SQLite deployment

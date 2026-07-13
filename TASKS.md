# Tasks

## 1. Success alert when a factura is timbrada — DONE

**Where:** `src/components/crear-factura-dialog.tsx`, `handleSave()` (~line 447-468).

Today, on a successful `POST /api/facturas`, the dialog just closes (`onOpenChange(false)`) and
calls `onSaved?.()` — no feedback at all. Every other success path in the app (e.g. email sending
in `src/app/(dashboard)/facturas/page.tsx:219`) already uses `alertSuccess` from
`src/lib/alerts.ts`, which wraps SweetAlert2 (already a dependency, already themed to the app's
orange primary). No new library needed.

**Change:**
- In `handleSave()`, right after `const data = await res.json()` succeeds (before
  `onOpenChange(false)`), call `alertSuccess("Factura timbrada", ...)`, including the folio/series
  from the response if available (`data.series`, `data.folio_number`) for a more useful message.

**Effort:** trivial, single file.

---

## 2. Send factura to multiple emails + multiple emails per cliente — DONE

**Current state:**
- Sending: `src/app/(dashboard)/facturas/page.tsx` — `openSendEmail`/`confirmSendEmail`
  (~lines 174-223) use a single `emailAddress` string, POSTed as `{ email }` to
  `src/app/api/facturas/[id]/email/route.ts`, which proxies straight to FacturAPI's
  `POST /invoices/{id}/email`.
- FacturAPI's endpoint **already accepts an array**: `email: string | string[]` (max 10), confirmed
  in `docs/facturapi/api-es.yaml:4767-4891`. So the send flow itself needs no backend changes —
  just send an array instead of a single string.
- Clientes: there is **no local `clientes` table** — customers live entirely in FacturAPI
  (`src/app/api/clientes/route.ts`, `[id]/route.ts` proxy CRUD to FacturAPI's `customers`
  resource). FacturAPI's `Customer` object only has a single `email` field
  (`docs/facturapi/api-es.yaml:15239-15245`, no metadata field to stash extra emails in). So
  "multiple emails per cliente" cannot be stored on the FacturAPI customer object — it needs a
  small local table of our own, keyed by the FacturAPI customer id + org, purely to prefill the
  send form.

**Plan:**
1. **New table** `cliente_emails` (or `cliente_extra_emails`) in `src/lib/db/schema.ts`, tenant-scoped
   like the other RLS tables (`orgId`, `customerId` [FacturAPI id], `email`), plus a migration
   modeled on `drizzle/0001_rls.sql` to add it to the RLS-protected list.
2. **Cliente form** (`src/app/(dashboard)/clientes/page.tsx`, `FormState`/`handleSave`, currently
   plain `useState`, no react-hook-form/zod — keep that pattern): replace the single `email` text
   input with a small repeatable list (add/remove rows), keep the FacturAPI `email` field as
   "primary" (first entry) for backward compat with anything relying on it, persist the rest to the
   new local table via a small API route (e.g. `PUT /api/clientes/[id]/emails`).
3. **Send-email dialog** (`facturas/page.tsx`, `openSendEmail`): fetch the cliente's saved emails
   (primary FacturAPI email + local extras) and prefill a multi-email input (chips/tags style,
   reuse whatever multi-value input pattern already exists in the app if any, otherwise a simple
   comma-separated or add-on-Enter input). `confirmSendEmail` posts `{ email: string[] }`.
4. **`api/facturas/[id]/email/route.ts`**: no change needed beyond passing the array through
   (already just forwards `body`).

**Effort:** medium — one migration, one new small API route, two form/UI updates.

---

## 3. Fix MXN/USD conversion in factura creation — DONE

**Root cause found:** `mapPedimentoToItems()` in `src/components/crear-factura-dialog.tsx:162-206`
sets `precio: p.precioUnitario.toFixed(2)` verbatim. `precioUnitario` is computed in
`src/lib/parser.ts:237` as `valAduana / cantidad`, and `valAduana` ("Valor en Aduana") is parsed
from the pedimento's USD-denominated customs column — i.e. `precioUnitario` is **always in USD**,
regardless of which currency the invoice is being created in.

When a pedimento is linked, the dialog defaults `currency` to `"MXN"`
(`crear-factura-dialog.tsx:271`) and pre-fills `exchangeRate` from `pedimento.tipoCambio`
(:272, the real DOF exchange rate parsed off the pedimento PDF) — but that exchange rate is only
ever used for the `exchange` field sent to FacturAPI (:413-420) and displayed as "TC: ..." — **it's
never multiplied into the item prices**. Net effect: a "MXN" invoice is actually priced using raw
USD numbers, undercharging by roughly the peso/dollar rate (~18x). Toggling the currency selector
to "USD" doesn't fix or break anything further, since prices are already USD — but nothing
recalculates if a user switches back and forth after editing items.

**Fix:**
1. In `mapPedimentoToItems()`, accept the pedimento's `tipoCambio` and the target `currency`, and
   compute `precio` as `currency === "MXN" ? precioUnitario * tipoCambio : precioUnitario`.
2. Re-derive items whenever `currency` changes for a pedimento-linked factura (currently items are
   only built once on dialog open via `buildItemsFromPedimento`) — either recompute in a `useEffect`
   keyed on `currency`, or store the raw USD `precioUnitario` per row and derive the displayed/
   submitted `precio` at render/submit time instead of baking it into `ItemRow` state.
3. Manually-added rows (honorarios, impuestos aduaneros) are not pedimento-sourced and should stay
   as entered — only partida rows need the conversion.
4. `src/app/(dashboard)/facturas/page.tsx:320-322` — the facturas list always renders totals with a
   bare `$` prefix, ignoring `f.currency` (already stored in the `facturas` table,
   `schema.ts:80`). Add the currency code/label (e.g. `$1,234.56 USD` vs `$1,234.56 MXN`) so
   already-created invoices in either currency are distinguishable at a glance.

**Effort:** medium — the item-row recompute is the fiddly part; the list-page label fix is trivial.

---

## Suggested order

1. Timbrado success alert (trivial, ships immediately, no dependencies).
2. Currency conversion fix (self-contained to `crear-factura-dialog.tsx` + list page, no schema
   changes, and it's an active correctness bug — likely highest priority).
3. Multi-email sending (needs a new table + migration, more moving parts — do last).

# Polish backlog

Smaller UI/UX tickets, tracked separately from `tasks.md` (the phased migration plan). Each item
below is a discrete, independently-shippable change.

---

## 1. Redirect to pedimento detail after upload — done

- [x] `(dashboard)/pedimentos/page.tsx`: `handleFile` now does `router.push(`/pedimentos/${data.id}`)`
      instead of re-fetching the list and staying put. `/api/parse` already returns `id` in both
      the new-pedimento and duplicate-pedimento response shapes, so this covers both paths.

---

## 2. Remove stat cards from pedimento detail view — done

- [x] Removed the "Total partidas" / "Con incrementables" / "Sin incrementables" cards from
      `(dashboard)/pedimentos/[id]/page.tsx`. Also removed the now-unused `conInc`/`total` locals
      and the `Card`/`CardContent` import stayed (still used by the partidas table itself).

---

## 3. Button styling parity with old app — done

- [x] "Exportar Excel" → solid green, `bg-[#1A7F4B] hover:bg-[#15663A]`, matching the old app's
      `.btn-export` colors exactly (pulled from `frontend/index.html`'s `--green` CSS var).
- [x] "Autocompletar SAT" → gold gradient, `bg-gradient-to-br from-[#f5c518] to-[#e0a800]` with dark
      text (`#1a1a1a`), matching the old app's `.btn-automap` `linear-gradient(135deg, #f5c518 0%,
      #e0a800 100%)` exactly.

---

## 4. Trim sidebar nav — done

- [x] Removed "Dashboard" and "Organización" from `app-sidebar.tsx`'s `navItems`.
- [x] `/` (root) now redirects straight to `/pedimentos` (`(dashboard)/page.tsx`) instead of
      rendering the old mock-data dashboard placeholder — leaving that page live but unlinked would
      have been worse than removing it, since it only ever showed fake numbers.
- [x] Per user's explicit call: deleted `/organizacion` (the Clerk `<OrganizationProfile>` page
      added in Phase 9) entirely rather than just unlinking it — org/member management is already
      one click away via the `OrganizationSwitcher` in the top bar, so the standalone page was
      redundant.

---

## 5. Fold Complementos into Facturas — done

- [x] Deleted the standalone `(dashboard)/complementos/page.tsx` and its sidebar entry.
- [x] `/api/complementos` GET now also selects `facturas.facturapiId as facturaFacturapiId` so the
      Facturas page can match each complemento back to the FacturAPI invoice row it belongs to
      (the invoice list itself comes straight from FacturAPI, not the local DB, so this join key
      was the missing piece).
- [x] Facturas page (`(dashboard)/facturas/page.tsx`): PPD invoices with `status: "valid"` get a
      "Registrar pago" button that opens the same dialog the old standalone page had (monto /
      fecha_pago / forma_pago → `POST /api/complementos`); on success the row auto-expands to show
      the newly issued complemento.
- [x] Per user's explicit design choice (expandable-per-invoice, not a separate dialog or a flat
      global list): PPD rows with ≥1 issued complemento get an expand chevron + a `(n)` count next
      to the payment-method badge; expanding reveals an inline sub-table (fecha pago / monto / forma
      pago / UUID) for just that invoice's complementos.
- [x] Verified the modified join query directly against the DB (real insert → select → assert the
      new `facturaFacturapiId` field resolves correctly → cleanup) since a full FacturAPI round trip
      isn't warranted for what's an additive, non-behavioral query change — the POST path and
      FacturAPI calls themselves are untouched from Phase 6/7's already-verified `saveFactura`/
      complement-creation logic.

---

## Verification (all tickets)

- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding in
      `use-mobile.ts`), `npm run build` all clean after a full `.next` cache clear (stale build
      manifest briefly referenced the deleted `/complementos` and `/organizacion` routes — resolved
      by the clean rebuild, not a real issue)
- [x] Build's route manifest confirms `/complementos` and `/organizacion` no longer exist; `/` is
      now dynamic (redirect) instead of static
- [x] Re-ran the regression suite (RLS isolation, SAT search, productos integration, export
      integration) — all still pass
- [ ] **User to verify in browser**: button styling (gradient/green), the upload→detail redirect,
      and the expandable PPD complementos rows are all visual/interactive — worth a quick look
      before considering this backlog fully closed

---

## 6. "Nueva factura" dialog was broken + didn't match the old app's "Crear factura" flow — done

- [x] **Root cause of the visual bug** (squished dialog, description column crushed to ~0 width):
      `<DialogContent className="max-w-2xl">` — the shared `Dialog` component's base classes
      already include `sm:max-w-sm` (384px). An unprefixed `max-w-2xl` doesn't win against that at
      desktop widths (same-specificity same-media-query rules resolve by source order, and the
      component's own `sm:max-w-sm` sits later in Tailwind's generated stylesheet than a plain
      utility). Fixed by using `sm:max-w-2xl` — verified directly against `cn()`/`tailwind-merge`
      that this actually removes the conflicting `sm:max-w-sm` rather than just adding another
      class alongside it. Confirmed no other `DialogContent` in the app has this pattern.
  - [x] Superseded by the full rebuild below (dialog is now `sm:max-w-4xl` to fit the wider ported
        layout), but the root-cause fix is what matters going forward for any future dialog.
- [x] Renamed the dialog title from "Nueva factura" to "Crear factura", matching the old app's
      `frontend/index.html` exactly — old app's trigger button and modal title were *already*
      different labels ("+ Nueva factura" button, "Crear factura" panel heading), so the sidebar
      trigger button keeps saying "Nueva factura" and only the dialog title changed.
- [x] Rebuilt the dialog to match the old app's manual-mode `openFacturarPanel(true)` /
      `buildInvoiceBody()` flow (`frontend/index.html:2665-2990`), which was far more than the
      simple 4-field form this was before:
    - Optional pedimento-link picker (searchable, ported as a shadcn Popover+Command combobox
      instead of the old hand-rolled DOM-positioned dropdown — same precedent as the SAT catalog
      combobox from Phase 4/5). Linking a pedimento tags every invoice item with
      `customs_keys: [pedimento_num]` and pre-fills the exchange-rate field from that pedimento's
      tipo de cambio, exactly like the old app.
    - Full 23-option "Uso del CFDI" select (was a free-text input before).
    - Item table pre-filled with the same two default concepts as the old app — "GASTOS AGENCIA
      ADUANAL" (clave 80151605) and "HONORARIOS COMERCIALIZADORA" (clave 80151604), both unit
      `E48`, both checkable-but-not-deletable — plus a "+ Agregar concepto" affordance for
      additional deletable rows, and a per-row checkbox (+ check-all) to control which concepts
      actually get included when timbrando, matching the old table exactly.
    - Retenciones toggle scoped to the Comercializadora row only: "+ Agregar retenciones" reveals
      ISR (10% default) and IVA retenido (5.33% default) inputs, which get stacked as additional
      `withholding: true` tax entries on top of the normal IVA — ported 1:1 from the old
      `buildInvoiceBody`'s tipo === 'comercializadora' branch.
    - Método de pago (PUE/PPD) toggle buttons with the same side effects as the old app: switching
      to PPD forces forma de pago to `99` and tipo de CFDI to `P`; switching back to PUE resets
      either field if it was left at those PPD-only values.
    - Tipo de CFDI select (I/E/T/P), Tasa IVA toggle (16%/8%, defaults to 8% in manual mode — same
      as old app), Moneda toggle (MXN/USD) with a conditional exchange-rate input required before
      submitting when USD is selected.
    - "Vista previa PDF" button (`POST /api/facturas/preview`, opens the returned PDF in a new tab)
      — this button didn't exist in the previous version at all.
    - Backend needed **no changes**: `/api/facturas` and `/api/facturas/preview` already proxy the
      request body to FacturAPI transparently (only stripping `pedimento_id` before forwarding), so
      the richer payload (multi-tax items, `customs_keys`, `exchange`, `type`) just works.
- [x] `scripts/test-crear-factura-payload.ts` — real FacturAPI sandbox call (not mocked)
      constructing the exact payload shape `buildInvoiceBody()` produces for the two default
      concepts, including the stacked ISR + IVA-retenido withholding taxes on the Comercializadora
      item — this specific tax combination wasn't exercised by any earlier test. Verified: real
      invoice timbrado (`status: "valid"`, real UUID), the computed total matches the expected math
      exactly (3473.40 = 1620 aduanal + 1853.40 net comercializadora after 8% IVA and the two
      retenciones), the preview endpoint responds OK, and cancellation works. Cleaned up the test
      org afterward.
- [x] Re-ran the full regression suite (RLS isolation, SAT search, productos integration, export
      integration) — all still pass.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed `/facturas` is still auth-gated (307 redirect
      when signed out).
- [ ] **User to verify in browser**: the dialog layout at its new width, the pedimento-link
      combobox, and the retenciones toggle are all visual/interactive.

---

## 7. Small polish batch — done

- [x] Removed the browser's native number-input spinner arrows on the "Cant." and "Precio" columns
      in the Crear factura item table (`[appearance:textfield]` + hiding the WebKit spin-button
      pseudo-elements), scoped to just those two inputs as requested — left every other number
      input in the app (Registrar pago monto, retenciones %, T.C.) untouched.
- [x] Productos module: added the bulk-select checkmark column from the old app
      (`frontend/index.html`'s `productos-check-all`/`producto-check` pattern) — per-row checkbox,
      header checkbox with proper indeterminate state (some-but-not-all selected), and a bulk
      action bar ("N seleccionados" + "Eliminar seleccionados") that appears in the page header
      next to "Nuevo producto" when anything is selected. Bulk delete confirms once, then fires all
      `DELETE /api/productos/[fraccion]` calls in parallel — same approach as the old app's
      `deleteSelectedProductos` (no bulk-delete endpoint needed). This closes the "deferred" item
      noted back in Phase 5.
- [x] Global "everything clickable shows a pointer cursor" pass:
    - `src/app/globals.css`: base-layer rule giving `cursor: pointer` to every enabled `<button>`,
      `<a href>`, `<select>`, and `[role="button"/"checkbox"/"tab"/"menuitem"]`, plus checkbox/radio
      inputs and their labels; disabled/`aria-disabled` elements get `cursor: not-allowed` instead.
      Utilities always win over this base-layer rule in Tailwind's cascade, so any component that
      needs a different cursor (e.g. the sidebar resize handle, which already sets
      `cursor-w-resize`/`cursor-e-resize` explicitly) is unaffected.
    - `src/components/ui/command.tsx`: `CommandItem` (used by the SAT-catalog combobox and the new
      pedimento-link combobox) had a hardcoded `cursor-default` utility class that would have beaten
      the global base rule — changed to `cursor-pointer` (and disabled state to `cursor-not-allowed`
      to match), since these are clickable list results.
    - Audited every `onClick` in the app for anything *not* a `<button>`/`<a>`/`role`-tagged element
      that might've been missed: the only case was the clickable pedimento-list `<tr>` row in
      `(dashboard)/pedimentos/page.tsx`, which already had an explicit `cursor-pointer` class.
- [x] Primary button color now matches the sidebar's orange accent: `--primary`/`--ring` in
      `globals.css`'s `:root` block changed from the old blue (`oklch(0.505 0.226 262)`) to the same
      orange already used for `--sidebar-primary` (`oklch(0.68 0.199 48)`), with
      `--primary-foreground` switched to the matching dark navy text color. Dark mode already used
      this orange for `--primary`, so only the light-mode block needed the change. Everything that
      references `--primary`/`text-primary` (default-variant buttons, the "Volver" link, the
      automap overlay icon) picks this up automatically — no per-component changes needed.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; re-ran the regression suite (RLS isolation, SAT search,
      productos integration, export integration) — all still pass.
- [ ] **User to verify in browser**: all four of these are visual — the removed spinners, the
      Productos bulk-select bar, pointer cursors app-wide, and the new orange primary color.

---

## 8. Pedimento detail: Exportar/Autocompletar buttons on the filter row, right-aligned — done

- [x] Moved "Exportar Excel" and "Autocompletar SAT" out of `PageHeader` (top of page) and into the
      same row as the Todas/Con incrementables/Sin incrementables filter buttons — left group is
      the filters, right group is the two action buttons, via a `justify-between` flex row.
      Matches the old app's layout where these buttons live in the toolbar row above the grid, not
      in a separate header block.

---

## 9. Page titles moved into the top bar, centered — done

- [x] "Clientes / Directorio de clientes (FacturAPI)"-style title blocks no longer render inside
      the main content area — they're registered by each page (via `PageHeader`) into a shared
      context and rendered centered in the top bar instead, freeing the content area's vertical
      space for the actual table/grid.
- [x] `src/components/page-title-context.tsx` — `PageTitleProvider` + `usePageTitle(title,
      description?, icon?)` hook. Each page's `PageHeader` call registers its title on mount and
      clears it on unmount (so navigating to a page without a title doesn't leave a stale one).
- [x] `src/components/top-bar-title.tsx` — `<TopBarTitle>`, absolutely centered in the header
      (`left-1/2 -translate-x-1/2`, independent of the variable-width org switcher on the left and
      bell/avatar on the right), `pointer-events-none` and width-capped so it can't block clicks or
      overflow into other header controls on narrow viewports.
- [x] `src/components/page-header.tsx` — rewritten: still accepts the same `title`/`description`/
      `icon`/`children` props (no call-site changes needed anywhere), but now only renders
      something in the content area if the page also passes action buttons as `children` — pages
      with no header actions (e.g. Configuración) render nothing here at all, reclaiming the full
      content area from the very top.
- [x] `(dashboard)/layout.tsx` — wrapped in `<PageTitleProvider>`, header made `relative` to anchor
      the absolutely-centered `<TopBarTitle>`.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed every page route is still auth-gated (307)
      after the layout change; re-ran the regression suite (RLS isolation, SAT search, productos
      integration, export integration) — all still pass.
- [ ] **User to verify in browser**: the centered top-bar title (including how it behaves with a
      long org name on the left) and the reclaimed content-area space are both visual.

---

## 10. Productos: inline editing, no modal — done

- [x] Removed the "Agregar/Editar producto" `Dialog` entirely. Editing a row now turns that row
      itself into editable fields in place (Descripción as a plain input, ClaveProdServ/Unidad as
      the same `<SatComboBox>` used elsewhere, Fracción shown read-only since it's the row's
      identity and can't change), with a checkmark/✕ pair replacing Editar/Eliminar for that row
      while editing. Only one row can be in edit mode at a time (other rows' Editar/Eliminar
      buttons disable while something's being edited, matching the old app's implicit
      one-at-a-time editing model).
- [x] "Nuevo producto" no longer opens a dialog either — it inserts a new editable row at the top
      of the grid (Fracción becomes an editable input for this row only, since it doesn't exist
      yet), with the same checkmark/✕ save/cancel actions.
- [x] Small behavior improvement over the old modal: selecting a ClaveProdServ via the combobox now
      auto-fills the "Descripción SAT" column from the catalog match (same pattern already used on
      the pedimento detail grid's mapping flow) — the old modal had a `descripcionSat` field in its
      state that was silently never wired to any input, so it was always blank for new/manually-
      re-mapped products. This fixes that rather than porting the gap forward.
- [x] Inline validation errors render as a row directly under the row being edited instead of a
      dialog-level message.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; `scripts/test-productos-integration.ts` still passes
      (exercises the same `PUT`/`POST /api/productos` endpoints, unchanged); confirmed `/productos`
      still auth-gated (307 when signed out).
- [ ] **User to verify in browser**: inline add/edit flow, especially the SatComboBox popovers
      rendering correctly inside a table row.

---

## 11. "Facturar" button on the pedimento detail view — done

This was the one deliberately-deferred piece of Phase 6 ("did NOT build the old app's Facturar
panel" — pedimentos → productos → factura, plus impuestos aduaneros + retenciones). Per the user's
explicit call-out that this is the most important part of the app, implemented it properly by
studying the old app's `openFacturarPanel(false)` / `buildItemsTable()` / `buildInvoiceBody()`
(`frontend/index.html:2665-2990`) rather than approximating it.

- [x] **Key realization from re-reading the old app**: "Nueva factura" (manual) and "Facturar"
      (from a pedimento) aren't two different features — they're the *same* panel/dialog with a
      `manual` flag that changes its defaults and item-population logic. So instead of building a
      second dialog, extracted the existing Crear Factura dialog out of `facturas/page.tsx` into a
      shared `src/components/crear-factura-dialog.tsx` (`<CrearFacturaDialog>`), taking an optional
      `pedimento` prop:
  - No `pedimento` prop → manual mode, unchanged from before (Uso CFDI G03, IVA 8%, honorarios
    prefilled rows, pedimento-link picker visible for optional linking).
  - `pedimento` prop present → Facturar-from-pedimento mode: Uso CFDI defaults to **G01** (Adquisición
    de mercancías) instead of G03, IVA defaults to **16%** instead of 8%, exchange rate pre-filled
    from the pedimento's tipo de cambio, the pedimento-link picker is hidden (the link is implicit —
    `pedimentoLink` state is set directly from the prop), and there's no honorarios/retenciones UI
    at all (matches the old app's `buildItemsTable` never building that markup outside manual mode).
  - `buildInvoiceBody()` needed **zero changes** to support the new mode — it already branched on
    `pedimentoLink` (for `customs_keys`/`pedimento_id`) and `honorariosTipo` (for retenciones), and
    pedimento-mode items simply don't set `honorariosTipo`, so they fall through to plain IVA tax.
- [x] `mapPedimentoToItems(pedimento, productos)` — pure function (exported, no `fetch` inside, so
      it's directly unit-testable) porting the old `buildItemsTable`'s non-manual branch: one row
      per partida with `clave`/`unit_key` looked up from the org's `productos` mapping, falling back
      to the ported `UMC_TO_UNIT_KEY` table (all ~21 entries from `frontend/index.html:1661-1683`)
      when a fracción has no productos entry yet, plus one aggregated "Impuestos Aduaneros (DTA +
      IGI + PRV)" row (fixed clave `93161608`, unit `ACT`, readonly clave/unit/qty, editable price)
      — only added when `dta+igi+prv > 0`, exactly like the old app.
  - Real (new) usability improvement over the old app: partida rows with no clave mapping show an
    inline ⚠ warning icon next to the ClaveProdServ field — the old app had this too (`warn-clave`
    span), so this is parity, not an addition, but worth calling out since it directly helps the
    "most critical part of the app" actually be usable at a glance.
  - The header "select all" checkbox correctly excludes the Impuestos Aduaneros row from bulk
    toggling, matching the old app's separate `.item-check-aduaneros` class that `check-all-items`
    never touched.
- [x] Added a "Facturar" button to the pedimento detail page (`(dashboard)/pedimentos/[id]/page.tsx`),
      leftmost in the right-aligned action group — matches the old app's button order (Facturar,
      Autocompletar SAT, Exportar Excel).
- [x] `scripts/test-facturar-pedimento.ts` — two-part real verification:
  1. Structural assertions on `mapPedimentoToItems` with a fixture: a mapped partida picks up its
     clave/unit from `productos`, an unmapped partida falls back to the UMC table and would render
     the warning icon, the aduaneros row totals DTA+IGI+PRV correctly and is readonly where
     expected, and a pedimento with zero customs taxes gets no aduaneros row at all.
  2. **Real FacturAPI sandbox call** (not mocked) using a genuinely valid pedimento number (parsed
     from the actual test PDF used throughout this project's earlier phases — a synthetic pedimento
     number gets rejected by FacturAPI's real SAT-checksum validation on `customs_keys`, which is
     itself a useful thing to have confirmed): timbrado a real invoice with one partida item + the
     aggregated impuestos aduaneros item, both tagged with `customs_keys`, and the total matched the
     expected math exactly (3717.80 = 150.5×10×1.16 + 1700×1.16).
- [x] Re-ran the full regression suite (RLS isolation, SAT search, productos integration, export
      integration, the Crear Factura payload test from ticket 6) — all still pass.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed `/pedimentos` still auth-gated (307).
- [ ] **User to verify in browser**: opening "Facturar" from a real pedimento with a mix of
      mapped/unmapped partidas and non-zero DTA/IGI/PRV, to see the pre-populated item table,
      warning icons, and aduaneros row render correctly together.

---

## 12. Layout density pass — done

- [x] Pedimento detail: "← Pedimentos" back link moved out of its own row and into the left side of
      the Todas/Con incrementables/Sin incrementables filter row — no longer costs a full row of
      vertical space by itself.
- [x] Pedimento detail button colors: "Exportar Excel" is back to a plain `variant="outline"` button
      (matching every other neutral action button in the app) instead of a hardcoded green; the
      green was ticket 3's literal port of the old app's styling, but the user reconsidered it here
      in favor of consistency. "Autocompletar SAT" changed from the gold/yellow gradient to an
      orange gradient (`from-orange-500 to-orange-700`), matching the app's new orange primary color
      rather than the old app's gold accent.
- [x] Clientes, Facturas, Productos: removed the standalone toolbar row (search box / filter select
      / action buttons living in their own `mb-4` block above the grid) and folded those controls
      directly into the grid's own header row (`<thead>`), so the table is the only thing taking up
      vertical space in the content area — no separate toolbar section at all:
  - **Clientes**: the "Nombre fiscal" column header is now the search input itself (debounced
    search unchanged); "Nuevo cliente" sits in the rightmost header cell, right-aligned.
  - **Facturas**: the "Método" column header is now the PUE/PPD filter `<select>` itself; "Nueva
    factura" sits in the rightmost header cell.
  - **Productos**: the rightmost header cell shows "Nuevo producto" normally, and swaps to the
    selection count + "Eliminar seleccionados" bulk-delete bar when any rows are checked — same
    logic as before, just relocated from the page header into the grid header.
  - **Pedimentos** (list page): "Subir pedimento" moved into the rightmost header cell too, same
    pattern as the others; the hidden `<input type="file">` it triggers just moved out of
    `PageHeader`'s children into a plain hidden element elsewhere in the page (it renders nothing
    either way, so this is a no-op visually).
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed all four touched routes are still auth-gated
      (307 when signed out); re-ran the regression suite (RLS isolation, SAT search, productos
      integration, export integration) — all still pass. (This ticket only touched layout/JSX
      structure and inline styling, not data flow or API calls, so no new integration test was
      needed — the existing ones already cover the underlying logic these pages call.)
- [ ] **User to verify in browser**: this is the highest-risk-of-looking-off ticket in this batch —
      worth checking that the header-row controls (especially the Clientes search input and the
      Facturas filter select) don't look cramped or misaligned against the plain text column
      headers next to them.

---

## 13. Remove remaining number-input spinner arrows — done

- [x] Found and fixed the 4 remaining `type="number"` inputs missing the spinner-hiding classes
      (ticket 7 only covered the item table's Cant./Precio columns):
  - `crear-factura-dialog.tsx`: the ISR and IVA retenido % inputs under "+ Agregar retenciones"
  - `crear-factura-dialog.tsx`: the T.C. (exchange rate) input shown when Moneda = USD
  - `facturas/page.tsx`: the "Monto" field in the Registrar pago dialog
- [x] Grepped every `type="number"` in the codebase afterward to confirm none were missed.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean.

---

## 14. Fix misleading "Vista previa no disponible" error for zero-price items — done

- [x] Root cause: `buildInvoiceBody()` in `crear-factura-dialog.tsx` skipped items with no
      ClaveProdServ (correctly) but never checked for a zero/blank price — it would send a `price:
      0` item straight to FacturAPI, which rejects it, and the catch-all error message
      ("Vista previa no disponible... puede no estar disponible en sandbox") made it look like a
      sandbox limitation instead of what it actually was: a validation gap.
- [x] Added an explicit price check in the same item-building loop: items with `price <= 0` are now
      excluded and their descriptions collected, then reported with a specific error — *"El precio
      no puede ser 0: {conceptos}. Ingresa un precio válido para cada concepto."* — before falling
      through to the generic "select at least one item" message.
- [x] This fix lives in `buildInvoiceBody()`, which both "Vista previa PDF" and "Timbrar factura"
      call, so both flows get the accurate error now, not just preview.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean.

---

## 15. Missing Unidad description labels + "Tipo de Documento" question — done

- [x] **Root cause**: `<SatComboBox>` only shows the small description label under a mapped value
      when the caller explicitly passes a `description` prop. Every ClaveProdServ combobox that
      persists its own description (pedimento detail grid) passed it; every **Unidad** combobox
      (pedimento detail grid, Productos add/edit, Crear Factura item table) never did, because none
      of those pages stored a unit description anywhere — so the label just silently never rendered.
      The old app worked around this the hard way (bulk-fetching descriptions for every unique
      `unit_key` up front and stashing them in a side map, `frontend/index.html:1687-1707`).
  - Fixed properly instead of porting that workaround: `<SatComboBox>` now resolves its own
      description when the caller doesn't supply one — if `mapped` is true and `description` is
      `undefined`, it looks up the exact key against its own `endpoint` (same lookup the old app's
      `unitDescMap` used, `/catalogs/units?q=<key>`, exact match). Fixes every current Unidad
      combobox at once, and any future one, with no per-page state needed.
  - Hit a real `react-hooks/set-state-in-effect` finding while building this (this file has fixed
      this exact class of finding before rather than suppressing it) — fixed the same way again: the
      stale-value reset case is derived at render time (`resolved?.value === value ? ... : null`)
      instead of an unconditional `setState(null)` at the top of the effect.
  - Verified directly against the real SAT catalog data (not assumed): `searchSatUnidades("H87")`
    returns `{ key: "H87", description: "Pieza" }`, confirming the exact-match lookup the new logic
    depends on actually works.
- [x] **"Tipo de Documento" research**: checked FacturAPI's docs (`docs.facturapi.io`) — there is
      **no separate document-type field**. FacturAPI's `type` field (I/E/T/P/N) is itself documented
      as *"Type of document"* — it's the exact same field we already expose as "Tipo de CFDI", not a
      second concept that maps down to it. So this wasn't a missing-feature gap, it was a labeling
      gap: the client's current system evidently presents this field with business terminology
      instead of raw CFDI codes.
  - Per the user's confirmation, renamed the field from "Tipo de CFDI" to "Tipo de Documento" and
      replaced the technical labels with business ones for the same 4 underlying values, no backend
      change: `I` → "Factura", `E` → "Nota de crédito", `T` → "Carta porte / Traslado", `P` →
      "Recibo de pago / Complemento de pago".
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; re-ran the regression suite (RLS isolation, SAT search,
      productos integration, export integration) — all still pass.
- [ ] **User to verify in browser**: confirm the Unidad description labels now show up correctly in
      the pedimento detail grid, Productos, and Crear Factura, and that the new "Tipo de Documento"
      labels read naturally for how your client actually talks about these documents.

---

## 16. Fix N+1 description fetches — ticket 15's fix was slower than the old app — done

- [x] **Root cause of the perceived slowdown**: ticket 15 made `<SatComboBox>` self-resolve its own
      description on mount when the caller doesn't supply one. That's correct for a single combobox,
      but the pedimento detail grid renders one Unidad combobox *per partida* simultaneously on page
      load — for a 56-partida pedimento, that's up to 56 concurrent fetches, most of them for the
      exact same handful of unit keys (H87, KGM, LTR, …). The old app never had this problem because
      it batched: fetch the productos list once, collect the *unique* `unit_key`s across all rows,
      fetch each unique key's description exactly once, then render from that map
      (`frontend/index.html:1696-1707`) — a handful of requests instead of dozens.
- [x] `src/lib/fetchCatalogDescriptions.ts` — new shared helper: takes a list of catalog keys
      (arbitrary duplicates allowed), dedupes them, fetches each unique key's description exactly
      once via `Promise.all`, returns a `key -> description` map. Same strategy as the old app's
      `unitDescMap`, just factored out so more than one page can use it.
- [x] Pedimento detail page (`(dashboard)/pedimentos/[id]/page.tsx`): `loadProductos` now also
      batch-fetches unit descriptions for every unique `unit_key` across the loaded productos in one
      pass, storing them in a new `unitDescMap` state; the Unidad combobox gets `description=`
      passed explicitly from that map (so it never has to self-resolve), and a manual selection
      updates the map immediately from the combobox's own `onSelect` callback for instant feedback.
- [x] Crear Factura dialog, pedimento mode (`crear-factura-dialog.tsx`): `mapPedimentoToItems` now
      takes an optional pre-fetched `unitDescriptions` map and attaches `claveDescription` (pulled
      straight from the productos row's already-stored `descripcionSat` — no fetch needed at all for
      that one) and `unitDescription` to each item; `buildItemsFromPedimento` resolves the actual
      unit key per partida (productos mapping or the UMC fallback) *before* batching, so fracciones
      with no productos entry still get their fallback unit's description without a fresh fetch per
      row. `mapPedimentoToItems` stayed backward-compatible (new param is optional, defaults to
      `{}`) — the ticket 11 test script needed no changes.
- [x] Verified directly: called `mapPedimentoToItems` with a fixture productos list and a manually
      supplied description map and confirmed both `claveDescription` and `unitDescription` land on
      the resulting item exactly as expected; re-ran `test-facturar-pedimento.ts` end-to-end (real
      FacturAPI sandbox call) to confirm nothing about the invoice-building path itself changed.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; re-ran the full regression suite (RLS isolation, SAT
      search, productos integration, export integration) — all still pass.
- [ ] **User to verify in browser**: open a real pedimento with many partidas and confirm the page
      now loads/settles noticeably faster than before ticket 15, with Unidad descriptions still
      showing correctly.

---

## 17. Suppress description labels in Crear Factura specifically — done

- [x] Per the user's explicit call, matched the old app's Facturar item table exactly: it never
      rendered description labels under Clave/Unidad (only the main pedimento grid and Productos
      table did). Added a `hideDescription` prop to `<SatComboBox>` — set on both the ClaveProdServ
      and Unidad comboboxes in `crear-factura-dialog.tsx`'s item table only.
  - Deliberately kept passing the pre-fetched `description=` values (`it.claveDescription`/
      `it.unitDescription` from ticket 16's batching) even though they're no longer displayed —
      `hideDescription` only suppresses the render, not the internal resolution. Passing `undefined`
      instead would have re-triggered `SatComboBox`'s per-row self-resolve fetch and brought back
      ticket 16's N+1 problem inside this exact dialog.
  - The pedimento detail grid and Productos page don't set `hideDescription`, so their labels are
      unaffected.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; re-ran the full regression suite (RLS isolation, SAT
      search, productos integration, export integration, facturar-from-pedimento) — all still pass.

---

## 18. Registrar pago dialog: currency indicator + forma de pago label — done

- [x] "Monto" now uses `<InputGroup>` with a `$` prefix and an `MXN` suffix addon (shadcn's
      input-group primitives, already in the project but unused until now) so it's unambiguous this
      field is a peso amount, not a bare number.
- [x] "Forma de pago" changed from a free-text input (showing just the raw SAT code, e.g. `03`) to a
      `<select>` with the same catalog already used in Crear Factura — `03 – Transferencia
      electrónica`, `04 – Tarjeta de crédito`, `28 – Tarjeta de débito`, `01 – Efectivo`, `02 –
      Cheque nominativo`, `99 – Por definir`. Exported `PAYMENT_FORM_OPTIONS` from
      `crear-factura-dialog.tsx` instead of duplicating the list, so both dialogs stay in sync if
      the catalog ever changes.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed `/facturas` still auth-gated (307); re-ran the
      regression suite (RLS isolation, productos integration) — still pass. (Purely UI/labeling
      change — the `POST /api/complementos` payload shape is untouched, still exercised by Phase 6's
      integration test.)

---

## 19. "Send by email" button on Facturas — done

- [x] Client asked whether they can customize the email FacturAPI sends (asunto, description, plus
      PDF/XML attached, like their current invoicing system). Checked FacturAPI's actual OpenAPI
      spec (found locally at `AnalizadorDePedimentos/docs/facturapi/api-es.yaml:4767-4949`, not
      guessed): `POST /invoices/{id}/email` accepts **only** an optional `email` field (single
      address or up to 10) — no `subject`/`message`/`body` parameter exists. The subject line and
      body copy are fixed by FacturAPI's own template; only the recipient(s) are controllable.
      Confirmed the sender/subject empirically too, via `scripts/test-email-inspect.ts` — a real
      sandbox invoice email sent to the user's own inbox to observe FacturAPI's actual template
      (not something documented anywhere, so this was the only reliable way to check). Building a
      fully custom subject/body would require bypassing FacturAPI's email endpoint entirely and
      sending our own mail (a real scope addition, not attempted here) — deferred until asked for.
- [x] What *was* missing and is a real, in-scope gap: there was no "send by email" button anywhere
      in the UI at all, even though `/api/facturas/[id]/email` (proxying FacturAPI's endpoint
      unmodified) has existed since Phase 6. Added a "Correo" button to each factura row, next to
      PDF/XML — `POST`s to the existing route with no body, so FacturAPI sends to the customer's
      registered email by default (matches the "Enviar al correo del cliente" case in FacturAPI's
      own docs). No backend changes needed.
- [x] Verified for real, not assumed: `scripts/test-email-inspect.ts` already proved the exact same
      underlying FacturAPI call (`client.post('invoices/{id}/email', body)`) the new button's route
      makes succeeds end-to-end (`{ ok: true }`) against the real sandbox.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding, after cleaning up
      an unused import in the new inspection script), `npm run build` all clean after a full `.next`
      clear.
- [ ] **User to verify in browser**: click "Correo" on a real factura and confirm it arrives as
      expected (already confirmed the underlying send works via the sandbox test above).

---

## 20. Facturas row actions were getting cluttered (up to 5 buttons/row) — done

- [x] Per the user's chosen option (kebab menu, out of 3 suggested approaches — icon-only buttons
      and a row-click detail view were the alternatives): PDF/XML/Correo — the three "distribute
      this document" actions — collapsed into a single "⋮" dropdown menu. "Registrar pago" and
      "Cancelar" stay as visible buttons since they change the invoice's state, not just move a copy
      of it around. A typical row now shows 1-3 visible controls instead of up to 5.
- [x] `src/components/ui/dropdown-menu.tsx` — new shadcn-style wrapper around `@base-ui/react/menu`
      (already a project dependency, same pattern as the existing `popover.tsx`/`command.tsx`
      wrappers) — `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`,
      with a `destructive` item variant for future use even though nothing currently needs it.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed no runtime/module-resolution errors in the dev
      server log and `/facturas` still auth-gated (307).
- [ ] **User to verify in browser**: this is a genuinely new interactive component (first dropdown
      menu in the app) — worth confirming the menu opens/positions/closes correctly and that
      clicking each item still does the right thing.

---

## 21. "Registrar pago" → icon-only with tooltip — done

- [x] Shrunk the "Registrar pago" button on PPD facturas from icon+label to icon-only (same
      Banknote icon, square 7×7 button matching the kebab menu's footprint), with a
      `<Tooltip>Registrar pago</Tooltip>` on hover so the action is still discoverable without
      needing the label to be readable at all times. `TooltipProvider` was already wrapping the
      whole app in `src/app/layout.tsx`, so no new setup was needed — just the first real usage of
      it outside `sidebar.tsx`.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; no runtime errors in the dev server log, `/facturas`
      still auth-gated (307).

---

## 22. Email route was swallowing FacturAPI's real error + ported SweetAlert2 — done

- [x] **Email debugging**: `/api/facturas/[id]/email/route.ts` was catching `FacturapiError` and
      always returning a hardcoded `"No se pudo enviar el correo"` string instead of forwarding
      `e.message` — so whatever FacturAPI's real reason for rejecting the send was got thrown away
      before it ever reached the UI. Fixed to surface the actual message. Directly verified against
      the real sandbox that the send-by-email call itself works correctly even for a customer with
      no email on file (`{ ok: true }`), so the failure isn't in FacturAPI's own behavior — with the
      real error now surfacing, the next attempt will show the actual cause instead of a generic
      dead end.
- [x] **SweetAlert2**: identified — old app used `sweetalert2@11` via CDN (`frontend/index.html:953`,
      `Swal.fire(...)` throughout). Installed the same library as a proper npm dependency instead of
      a CDN `<script>` (the CDN was purely a workaround for the old app having no build step; in
      this Next.js app the npm package is strictly better — tree-shakeable, typed, version-locked in
      the lockfile, no extra third-party network request).
- [x] `src/lib/alerts.ts` — `alertSuccess`/`alertError`/`alertWarning`/`alertInfo`/`confirmDelete`
      wrapping `Swal.fire`, same icon/shape/animation as the old app; confirm-color changed from the
      old app's gold (`#c9a84c`) to this app's own rebranded orange (`#ea580c`, matching the
      Autocompletar SAT gradient) for brand consistency, destructive-confirm red/gray kept as-is.
- [x] Replaced all 10 native `alert()`/`confirm()` call sites across the app (Clientes, Pedimentos
      list, Productos ×2, pedimento detail export/automap ×4, Facturas send-email ×2) with the new
      helpers — delete confirmations now show the warning icon + red "Eliminar"/gray "Cancelar"
      buttons matching the old app's exact delete-confirm pattern, instead of the browser's plain
      `confirm()` dialog.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; no runtime errors in the dev server log; confirmed
      Clientes/Pedimentos/Productos/Facturas all still auth-gated (307); re-ran the regression suite
      (RLS isolation, productos integration) — still pass.
- [ ] **User to verify in browser**: retry sending an email now that the real FacturAPI error (if
      any) will actually surface, and take a look at the new SweetAlert2-styled confirm/success/error
      dialogs across Clientes/Pedimentos/Productos/Facturas.

---

## 23. Tipo de Documento shouldn't auto-change with Método de pago — done

- [x] `handlePaymentMethodChange` in `crear-factura-dialog.tsx` was porting the old app's exact
      coupling: switching to PPD forced Tipo de Documento to "P" (Recibo de pago), and switching
      back to PUE reset it to "I" (Factura) — silently overwriting whatever the user had manually
      selected. Per the user's explicit correction (their business always wants "Factura" as the
      default regardless of payment method, and a manual override should survive toggling PUE/PPD),
      removed the `cfdiType` manipulation from that handler entirely. Forma de pago's own coupling
      (PPD forces "99 – Por definir") was left alone — only Tipo de Documento was reported as wrong.
  - Both init paths (manual mode and Facturar-from-pedimento mode) already default `cfdiType` to
      `"I"` on open — that default was never the issue, only the runtime override on toggle was.
      With that removed, the *only* thing that can change Tipo de Documento now is the user's own
      selection in that dropdown.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; re-ran the regression suite (RLS isolation, productos
      integration) — still pass. (Pure UI state-coupling fix, no payload-shape or API change — the
      existing Crear Factura / Facturar-from-pedimento sandbox tests weren't exercising this
      specific interaction and didn't need updates.)

---

## 24. Search on every grid + contained scrolling instead of whole-page scroll — done

Checked how the old app actually did this (`frontend/index.html:214-242`) before building — it's not
a universal rule: `#sec-productos`, `#sec-clientes`, `#sec-facturas`, `#sec-complementos` get
`display:flex; flex-direction:column; height:100%` with their `.table-wrap` set to
`flex:1; overflow-y:auto`, so only the grid body scrolls while the page chrome stays fixed.
`#sec-pedimentos` (which covers both the pedimento list *and* the partidas detail view in the old
app) was **not** in that list — it always scrolled as a whole page. Per the user's explicit
follow-up correction, this port diverges from the old app slightly: the **Pedimentos list** gets the
contained-scroll treatment (new relative to the old app), but the **pedimento detail/partidas view**
stays whole-page-scroll, matching the user's explicit "that one's the exception" instruction over the
old app's literal behavior.

- [x] **Layout**: `(dashboard)/layout.tsx`'s outer wrapper changed from `min-h-screen` to `h-screen`
      (fixed to the viewport instead of growing with content), and `<main>` changed from
      `flex-1 p-6 md:p-8` to `flex-1 min-h-0 overflow-hidden p-6 md:p-8 flex flex-col` — `main` no
      longer scrolls itself by default; each page now decides its own scroll behavior.
  - Clientes/Facturas/Productos/Pedimentos(list): root div is `h-full flex flex-col`, the `Card` is
      `flex-1 min-h-0 flex flex-col`, and the table's scroll container is `overflow-auto flex-1
      min-h-0` — only the rows scroll, the search/filter/action header row stays pinned in place.
  - Pedimento detail (`pedimentos/[id]`) and Configuración explicitly opt back into the old
      whole-page-scroll behavior with `h-full overflow-y-auto` on their own root, since `<main>` no
      longer provides that by default.
  - `<thead>` cells got `sticky top-0 z-10 bg-card` (matching the old app's
      `thead th { position: sticky; top: 0 }`, `frontend/index.html:475-477`) so the header stays
      visible while a contained grid's body scrolls underneath it.
- [x] **Search**: `src/components/grid-search-input.tsx` — new shared, nicer-looking search field
      (rounded `InputGroup` with a search icon and a clear/× button that appears once there's text,
      vs. the old app's and this app's previous plain bordered `<input>`). Wired into all four grids'
      header row, replacing one text column's label the same way Clientes already did it:
  - **Clientes**: unchanged behavior, restyled — still the existing debounced `/api/clientes?q=`.
  - **Facturas**: new — debounced, forwards `q` to `/api/facturas` (already proxied straight to
      FacturAPI's own `q` param, which the API spec confirms partial-matches
      `customer.legal_name`/item descriptions and exact-matches `customer.tax_id`/`folio_number`/
      `uuid`, so "cliente, RFC o folio" is accurate, not just a guess).
  - **Productos**: new — client-side filter across fracción/descripción/clave (no existing backend
      `q` support, and the dataset is the kind that's reasonable to filter in memory); bulk-select
      "select all" now operates on the filtered set, not silently including hidden rows.
  - **Pedimentos** (list): new — client-side filter across pedimento_num/importador, same reasoning
      as Productos.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed all five touched routes still auth-gated (307)
      and no runtime errors in the dev server log; re-ran the regression suite (RLS isolation,
      productos integration) — still pass.
- [ ] **User to verify in browser**: this is a real layout-mechanics change (fixed viewport height,
      nested flex/overflow, sticky headers) — worth confirming each grid actually scrolls internally
      without the page itself scrolling, that the pedimento detail page still scrolls the old way,
      and that nothing looks clipped at various window sizes.

---

## 25. Thinner rows on all module grids — done

- [x] Data-row cell padding (`px-5 py-3.5` → `px-5 py-2.5`) reduced across Clientes, Facturas,
      Productos, and Pedimentos (list) — the four grids from ticket 24. Header row padding was left
      as-is (`py-3`/`py-2.5`, whichever it already was) since only the data rows were called out as
      too tall; shrinking data rows alone also increases the contrast between header and body,
      which reads fine. The pedimento detail partidas table wasn't touched — it already uses a
      denser `px-2.5 py-2` from earlier work, not the `py-3.5` this ticket targeted.
- [x] `npx tsc --noEmit`, `npm run lint` (only the pre-existing unrelated finding), `npm run build`
      all clean after a full `.next` clear; confirmed no runtime errors in the dev server log and
      all four routes still auth-gated (307).

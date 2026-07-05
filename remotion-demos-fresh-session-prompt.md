# Task: Build the "Así lo haces hoy" section for the Neurocrow Pedimentos sales page

## Context

`/home/rodrigo/code/pedimentosV2` is a Next.js app for Mexican customs brokers ("Neurocrow Pedimentos" — brokers upload a "pedimento" customs PDF and the app auto-extracts line items and generates invoices). We're building a sales/landing page with a "así lo haces hoy" (pain point) section that shows the painful manual alternative: a real pedimento document, a spreadsheet, and invoicing software, with a copy-paste workflow happening between them.

**Critical lesson learned from earlier attempts:** abstract Tailwind-recreated documents/spreadsheets never look "real" — they read as generic mockups. The fix is to build this as a live, looping CSS/JS animation directly in the page (NOT a pre-rendered video, NOT Remotion) that overlays cursor movement and highlight effects on top of an actual real document image. Orchestration only — no fake content recreation for the pedimento panel.

## What's already prepared

A real (redacted/dummy-data) pedimento partidas page is ready at:

```
/home/rodrigo/code/pedimentosV2/public/marketing/pedimento-partidas.png
```

1275×1650px. This is page 3 of a real pedimento PDF (the "ANEXO DEL PEDIMENTO" / partidas listing), with all PII (RFC, CURP, agente name, e.firma signature) replaced by realistic dummy data using PyMuPDF text-layer editing (not black-box redaction) — so it reads as a complete, genuine document, not a censored one. It shows 3 real partidas (line items) with fracción, descripción, cantidad, valor, and identificadores.

**Rough highlight coordinates** (as % of the 1275×1650 image — verify by eye and nudge as needed):

| Partida | Box (x%, y%, w%, h%) |
|---|---|
| 2 | `1%, 30%, 98%, 18%` |
| 3 | `1%, 55%, 98%, 18%` |
| 4 | `1%, 79%, 98%, 9%` |

## What you need to build

A three-panel section, side by side (or stacked on mobile), showing the manual workflow a customs broker does today:

### Panel 1 — El pedimento (real document)
Use `pedimento-partidas.png` as a background image inside a "document viewer" frame (simple browser/PDF-viewer-style chrome — a thin title bar is fine, keep it minimal). Animate an absolutely-positioned highlight box (rounded, semi-transparent orange border/glow) that cycles smoothly through the 3 partida coordinates above, looping forever (e.g. 2.5s dwell on each, ~0.6s eased transition between). Add a small cursor icon that moves along with the highlight.

### Panel 2 — Excel/hoja de cálculo
No real screenshot asset exists for this one — build a convincing recreation using real CSS (not a vague table): actual spreadsheet chrome (column letters A, B, C... across the top, row numbers down the left, thin gridlines, a formula bar, Excel's green-ish accent color), populated with columns matching the partidas (Fracción, Descripción, Cantidad, Valor). Animate a cursor moving to a cell, then a "pasted" flash/highlight effect on that cell in sync with Panel 1's highlight cycle (i.e., when Panel 1 highlights partida 2, Panel 2 should show that same data "being pasted" into the next empty row).

### Panel 3 — Software de facturación / búsqueda de código SAT
Also no real screenshot — build a generic desktop invoicing form (plain input fields, labels like "Descripción", "Clave SAT", "Cantidad", "Precio") where a cursor visibly types/fills in values manually one field at a time, and a separate small moment showing a SAT code search dropdown/lookup (searching, then selecting a code) — since this project's actual `SatComboBox` component exists at `src/components/sat-combobox.tsx`, feel free to reuse it here in "manual search" mode (no `mapped`/`confidence` props) to make this panel's SAT lookup completely authentic, since it's a real reusable app component, not a recreation.

**Pacing:** the whole point is that this feels *slow and tedious* compared to the product's real "1 minute" flow — deliberately unhurried, slightly monotonous looping motion (not slow to the point of boring the viewer in one glance, but noticeably more laborious-feeling than the product's own demo sections elsewhere on the page).

## Where to build it

Build this as a standalone, reusable component: `src/components/landing/asi-lo-haces-hoy.tsx` (create the `landing` folder if needed). Don't wire it into any specific sales-page variant yet — several variants exist under `src/app/sales/v1` through `v6` and none has been chosen as the winner yet. Just build the component so it can be dropped into whichever one wins later.

## Constraints
- Real Next.js app conventions: TypeScript, Tailwind, App Router. Check `src/app/globals.css` for the actual brand colors/tokens (burnt-orange primary, deep navy, etc.) and reuse them — don't invent a new palette.
- No backend/data fetching needed — this is a purely visual, looping, client-side component with hardcoded fixture data.
- Keep motion smooth and CSS-transition-based (or `requestAnimationFrame`-driven), not relying on any video/canvas library.
- When done, verify it renders with `npm run dev` and visually check the loop timing/highlight alignment actually looks intentional, not janky.

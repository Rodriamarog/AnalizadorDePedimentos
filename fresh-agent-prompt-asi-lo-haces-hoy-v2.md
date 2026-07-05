# Task: Level up the "Así lo haces hoy" pain-point section on the Neurocrow Pedimentos landing page

## Where things live

- Repo: `/home/rodrigo/code/pedimentosV2` — a Next.js (App Router, TypeScript, Tailwind v4) app for Mexican customs brokers.
- **Read `AGENTS.md` in the repo root first.** This project intentionally runs a non-stock Next.js build — check `node_modules/next/dist/docs/` before assuming any API behaves like the Next.js you know.
- The component to edit: `src/components/landing/asi-lo-haces-hoy.tsx` (exports `AsiLoHacesHoy`).
- It's wired into the public landing page at `src/components/landing/landing-page.tsx`, rendered as `<AsiLoHacesHoy />` between the hero and the "Cómo funciona" section. That call site sits in a plain `<div>` with no ambient width constraint — the section's own `mx-auto max-w-6xl px-6 md:px-10` on its root `<section>` is the only thing constraining its width, so trimming that is sufficient to go wider.
- The landing page is served at `/` and is **already public** (no auth) per `src/proxy.ts`'s `isPublicRoute` matcher — you don't need to add any preview route, just run `npm run dev` and hit `http://localhost:3000/`.
- Global styles/tokens: `src/app/globals.css` (Tailwind v4 `@theme inline`, oklch color tokens — burnt-orange `--primary`, dark navy `--sidebar`, etc.). Reuse these; don't invent a new palette. This file also already has two keyframes this component depends on: `.nc-cell-paste` (Excel paste flash) and `.nc-caret` (blinking text-typing caret). Add more `nc-`-prefixed keyframes there if you need new ones, following the existing pattern (grouped under a `/* ── ... ── */` header comment).

## What the component currently does (read the file — this is just orientation)

Three panels side by side, each driven by one shared timeline (`useTimeline()`, a `stepIndex`/`phase` state machine that cycles through a `PARTIDAS` fixture array with a `TRANSITION_MS` move + `DWELL_MS` dwell per item):

1. **`DocumentPanel`** — a real redacted pedimento page image (`/public/marketing/pedimento-partidas.png`, 1275×1650px, real document with dummy PII) inside what's *currently* a fake "document viewer" chrome (a title-bar strip with 3 traffic-light dots + a filename label), with an animated orange highlight box cycling over 3 partida regions (coordinates as % of image size, stored per-partida in `PARTIDAS[i].box`).
2. **`ExcelPanel`** — a CSS-recreated Excel sheet; cursor moves to the next row, whole row "paste-flashes" in sync with panel 1's dwell.
3. **`InvoicePanel`** — a recreated generic invoicing form; typewriter-fills Descripción, opens a fake SAT-code lookup dropdown and "selects" a result, then types Cantidad and Precio Unitario, flashes "GUARDADO ✓", then clears for the next partida.

Everything resets/re-fills in lockstep off the same `phase`/`stepIndex`, driven by `async` `useEffect` chains using a local `wait(ms)` helper (plain `setTimeout` Promise).

## Requested changes (from the person who owns this, verbatim intent below — implement all of them)

### 1. Strip the fake "document viewer" chrome from the pedimento panel, and make it bigger
Right now the real pedimento image sits inside a fake little app window (rounded card, header bar with 3 colored dots + "pedimento.pdf — página 3 de 14" label) — like a mockup of a mockup. Get rid of that framing. The pedimento image itself should be the star: no enclosing "app window" chrome. A subtle drop-shadow or thin border directly on the image/paper edge is fine if you want it to read as a distinct sheet of paper, but no title bar / traffic lights / filename strip.

Reclaim that vertical space (and any extra width freed up by item 2 below) to make the pedimento **noticeably larger** than it is now. Don't be timid about it — this is the "reference document" the whole scene revolves around, it should be easy to actually read the partida text on it.

### 2. Remove the section's horizontal margins so there's room to make everything bigger
The section root currently has `mx-auto max-w-6xl px-6 md:px-10` — same constraint used by every other section on the page. For *this* section specifically, don't be afraid to drop that constraint (go closer to full-bleed / edge-to-edge, or at least a much wider max-width) so the three panels — especially the pedimento — have more horizontal room. Check how it looks against the sections above/below it (which do keep the `max-w-6xl` treatment) and make sure the transition doesn't look like a layout bug — e.g. you may want to keep a small fixed padding (`px-4` or `px-6`) at the true viewport edge even if you drop `max-w-6xl`, purely so content doesn't touch the browser edge on wide screens.

You have latitude here to also revisit the fixed panel heights (`h-[380px] md:h-[440px]`) and the equal 3-column split (`lg:grid-cols-3`) if giving the pedimento a larger share of the width (e.g. a wider first column) serves the "make the pedimento big and legible" goal better. Use your judgment — the goal is impact and legibility, not preserving the exact current grid.

### 3. Add a second real pedimento page + a scroll transition to it, with more partidas
Currently there's one document image with 3 partida regions (`PARTIDAS[0..2].box`, all within `pedimento-partidas.png`). The ask: after the animation finishes highlighting/capturing the partidas on page 1, play a **scrolling transition** (like scrolling down through a continuous PDF, not a page-flip/cut) that moves the view down to a **second pedimento page** with more partidas — and the Excel sheet keeps filling with additional rows sourced from that second page.

**The second-page asset is already prepared — it's not a blocker.** `public/marketing/pedimento-partidas-2.png` (1275×1650px, same dimensions as the first) is page 4 of the same real source pedimento as `pedimento-partidas.png` (which is page 3 of `public/pedimentos/6000505 PAGADO.pdf`), with the same PII-redaction treatment applied (real RFC/CURP/agent-name/e.firma text replaced in the PDF text layer with the *same* fake identity already used on page 1 — "MARIA DE LOS ANGELES RUIZ TORRES" / "Frontera Logistica Aduanera, S.C." / "XAXX010101000" etc. — so it reads as a continuous, consistent fake document across both pages, not two unrelated documents). It shows 3 more real partidas (SEC 5, 6, 7 — drinking-straw/cup items, fracción `39173291`). Verify it yourself (open the PNG) before wiring it up, and nudge the box coordinates below by eye if they're off — they were estimated from the source PDF's text-layer y-positions, not pixel-measured against the final render:

| Partida | Box (x%, y%, w%, h%) |
|---|---|
| 5 | `1%, 35%, 98%, 19%` |
| 6 | `1%, 54%, 98%, 19%` |
| 7 | `1%, 73%, 98%, 9%` |

For the accompanying Excel/invoice fixture data for these 3 new items, either invent plausible values in the same style as the existing 3 (they don't need to literally match the real fracción/descripción visible in the image — the existing 3 don't either, e.g. `PARTIDAS[0]` shows "Módulos de telecomunicación" as invented Excel/invoice fixture text while the real image underneath is actually about aluminum containers, and nobody's meant to cross-reference them at a glance), or lean into the real theme of page 2 (drinking straws/cups, fracción `39173291`) for a nicer touch — your call.

Implementation-wise: extend the `PARTIDAS` fixture with a `page: 1 | 2` field per item, add the 3 new entries with the page-2 boxes above, and implement the scroll transition in `DocumentPanel` — e.g. an `overflow-hidden` viewport with the two page images stacked vertically in a column, translated via `transform: translateY(...)` (CSS transition, matching the existing `duration-[Nms] ease-in-out` pattern already used for the highlight box) so it reads as continuous scrolling, not a swap, triggered when the active partida's `page` changes from 1 to 2. `ExcelPanel`'s row rendering already iterates `PARTIDAS` generically for the "filled" rows — you'll mostly need to make its trailing empty-row count and any hardcoded assumptions (e.g. the `[0,1,2].map(...)` extra blank rows, sized for exactly 3 items) scale sanely with a 6-item list instead of being hardcoded, and probably increase the panel height a bit so 6 filled rows don't cramp.

If you genuinely need a *third* page or more partidas than what's provided, don't fabricate one yourself — stop and ask, same reasoning as above (real document, not a recreation). But for this task, 2 pages / 6 partidas total is the ask.

### 4. Slow down / add breathing room at two specific spots in the timeline
Right now `ExcelPanel` pastes its row and `InvoicePanel` starts typing at the *same instant* — both keyed off `phase` flipping to `"dwelling"`. That's too mechanical. Wanted:
- **~1 extra second of pause between "the Excel paste finishes" and "typing starts in the sistema de facturación."** Concretely: in `InvoicePanel`'s effect (the one that runs `async function run()` when `phase === "dwelling"`), add a `await wait(1000)` (or similar) at the very start, before `setActiveField("descripcion")`, so it reads as "finished pasting into Excel, now switching over to the invoicing software."
- **A longer pause specifically between finishing "Cantidad" and starting "Precio Unitario"** in that same sequence — currently it goes straight from the last `await type(setCantidad, ...)` char into `setActiveField("precio")` with no gap. Add an explicit `await wait(...)` (something like 700–1000ms) between them, like someone pausing to check something (fits nicely with the new copy below, which mentions checking tipo de cambio / calculating value — thematically this could *be* that pause).
- **Budget check, don't just add the waits blindly:** `InvoicePanel`'s whole typed sequence must finish (including the "GUARDADO ✓" flash) *before* `phase` flips away from `"dwelling"` back to `"transitioning"` (that's `DWELL_MS`, currently `7000`), otherwise it'll get cut off mid-type when the effect's cleanup fires. Compute the worst-case total (longest `descripcion` string × its `msPerChar`, plus all the SAT-lookup waits, plus cantidad/precio typing, plus your two new pauses) and bump `DWELL_MS` if needed so there's still a few hundred ms of margin left for the saved-flash to actually be visible. Also remember `TRANSITION_MS` and `DWELL_MS` are read by `useTimeline` and also hardcoded in two `duration-[1400ms]` Tailwind classes (the highlight box in `DocumentPanel` and the cursor in `ExcelPanel`) — keep those in sync with `TRANSITION_MS` if you change it.

### 5. Rewrite the section heading/subhead to challenge the reader
Current copy:
```
Un pedimento, tres capturas manuales del mismo dato.
```
```
Copias la partida del PDF a una hoja de cálculo, y de ahí la vuelves a capturar en el
sistema de facturación — buscando la clave SAT a mano en cada línea.
```
Wanted direction (paraphrase these into copy that matches the site's existing voice — direct, a little wry, e.g. compare to the hero's "...antes de que se enfríe el café" or the CTA's "Deja de capturar pedimentos a mano."):
- Headline should be a direct question challenging the reader, roughly: "¿Cuánto tiempo tardas capturando partidas manualmente?"
- Subhead should pile on the tedious extra work involved, roughly: "Y luego tienes que ver si tienen incrementables, calcular el valor de aduana, revisar el tipo de cambio, buscar las claves del SAT... y así con cada partida." — feel free to polish the exact wording, just keep the "and then there's ALSO this, and this, and this" escalating-annoyance feel.
- Leave the small eyebrow label above the heading ("ASÍ LO HACES HOY") as-is — it still fits.

## Constraints / house style
- TypeScript, Tailwind, App Router conventions already used in this file — match them (see `cn()` from `@/lib/utils`, the `nc-`-prefixed CSS class naming convention in `globals.css`, the existing `Field`/`Caret` helper components at the bottom of the file).
- No backend/data fetching — everything is client-side, hardcoded fixture data, exactly as it is now.
- Motion stays CSS-transition or `requestAnimationFrame`/`setTimeout`-driven — no video/canvas library.
- Don't touch unrelated sections of `landing-page.tsx` or other panels' internals beyond what's needed to support the above.

## Verification
1. `npx tsc --noEmit -p tsconfig.json` — should show no new errors in `asi-lo-haces-hoy.tsx` or `landing-page.tsx` (there are pre-existing, unrelated type errors under `remotion-demos/` in this repo — ignore those, they're not yours).
2. `npm run dev`, then load `http://localhost:3000/` (public route, no login needed) and actually watch at least one full loop of the animation (it's long now — several seconds per partida — so be patient) to confirm:
   - the pedimento reads as a plain, large document image with no fake window chrome,
   - the section visibly uses more horizontal width than the sections above/below it (but doesn't look broken/edge-glued),
   - the new pacing feels deliberate rather than instant/robotic at the two spots called out in item 4,
   - the new headline/subhead copy is in place,
   - (if you implemented item 3) the scroll-to-page-2 transition actually reads as continuous scrolling and the Excel sheet keeps gaining rows from page 2's partidas.
3. If you have a way to capture a screenshot or short recording of it running (Playwright is not installed in this repo's own `node_modules`, but a couple of sibling repos on this machine have it — e.g. `~/code/aquilles/node_modules/playwright` — you can drop a throwaway `.mjs` script into one of those directories and run it from there with plain `node` to work around ESM resolution; clean the script up afterward), use it — a screenshot beats "I think it looks right."
4. Do **not** commit or push. Leave the changes for review, and give a clear written summary of what you changed and what you decided on your own judgment (e.g. exact copy wording, exact pixel/rem sizes chosen, exact fixture data for the 3 new partidas, any nudges you made to the page-2 box coordinates).

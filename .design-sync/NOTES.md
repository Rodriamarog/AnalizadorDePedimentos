# Design-sync notes — pedimentosV2

## Setup

This repo is a Next.js app, not a publishable component-library package (no
`main`/`module`/`exports`, no build script for the UI kit). To get a real
`dist/` + `.d.ts` for the converter (instead of the weaker synth-from-src
fallback), we added a dedicated barrel entry and build step:

- `src/design-system-entry.ts` — re-exports the design-system surface via
  `export *`. Everything in it has named exports only (no default exports),
  so the barrel is a straight passthrough.
- `tsconfig.ds-build.json` — extends the app's `tsconfig.json` with
  `incremental: false` (tsup's dts step fails under `--incremental` unless
  `tsBuildInfoFile` is set; disabling it for this one-off build was simpler
  than threading that config through).
- Build command (recorded as `cfg.buildCmd`): `tsup` emits
  `ds-dist/design-system-entry.mjs` + `.d.mts`; `@tailwindcss/cli` compiles
  `src/app/globals.css` (Tailwind v4, `@import "tailwindcss"`, not
  statically resolvable by the converter's scraper) to
  `ds-dist/styles.compiled.css`, which is what `cfg.cssEntry` points at.
- `tsup` and `@tailwindcss/cli` were installed with `--no-save` — they're
  sync tooling, not app dependencies. Re-installing them (`npm install
  --no-save tsup @tailwindcss/cli`) is part of re-running `buildCmd` on a
  fresh clone.
- tsup with `--format esm` emits `design-system-entry.d.mts`, but the
  converter's `.d.ts` scan only matches files literally ending `.d.ts` — it
  silently fell back to scanning `next-env.d.ts` (found 1 file, 0 component
  exports, `[ZERO_MATCH]`) until we added a `cp *.d.mts *.d.ts` step. If a
  future tsup/esbuild version changes the dts extension again, this is the
  failure mode to recognize.
- The converter resolves the package root by walking up from `--entry`
  looking for the nearest `package.json` with a `name` field. With no
  `package.json` in `ds-dist/`, that walk landed on the app's own root
  `package.json` (name `pedimentos-v2`, no `types` field) and tried to load
  a nonexistent `index.d.ts` — another `[ZERO_MATCH]`. Fixed by writing a
  synthetic `ds-dist/package.json` (`name: pedimentos-v2-ds`, `types:
  design-system-entry.d.ts`) so the walk stops in `ds-dist/` immediately.
  `scripts/build-ds.sh` (== `cfg.buildCmd`) generates all of this — run it,
  don't hand-run the tsup/tailwind commands separately.

## Scope: 23 of 25 candidate components

`src/design-system-entry.ts` re-exports:
- All 16 primitives in `src/components/ui/` (avatar, badge, button, card,
  command, dialog, dropdown-menu, input-group, input, popover, separator,
  sheet, sidebar, skeleton, textarea, tooltip).
- 7 of 9 app-level components in `src/components/`: clerk-auth-skeleton,
  crear-factura-dialog, grid-search-input, page-header,
  page-title-context, sat-combobox, top-bar-title.

**Excluded, deliberately:**
- `app-sidebar.tsx` — imports `next/navigation` (`usePathname`). Needs the
  Next.js app-router context to render; a plain esbuild bundle has no router
  to provide, so it would render blank/throw. Not wired to `cfg.provider`
  because there's no lightweight mock for the App Router — would need a real
  `next/navigation` shim.
- `neurocrow-lockup.tsx` — imports `next/font/google` (`Meddon`). This is a
  Next.js build-time macro (SWC-processed), not a real runtime export; it
  cannot be bundled by plain esbuild at all.

Both are real components worth having in the design system eventually — they
just need either a Next-runtime-aware build path or hand-written shims, which
was out of scope for this pass. Revisit if the design agent needs the sidebar
or the wordmark specifically.

## Preview authoring scope

The `.d.ts` scan found 97 exports (23 "real" components + their compound
subparts — `DialogHeader`, `CardFooter`, `SidebarMenuButton`, etc., all
flattened since shadcn exports every subpart as a top-level named export,
not a `Dialog.Header`-style namespace). Rich previews (`.design-sync/previews/`)
were authored only for the 23 root components; subparts are composed inside
their parent's story and otherwise ship the floor card individually — most of
them (`DialogTitle`, `CardFooter`, …) can't render standalone anyway.

`AppSidebar`/`NeurocrowLockup` aren't in scope at all (see above), so no
preview was authored for them.

## Known render warns

Confirmed benign by looking at the actual screenshot — don't chase these on
re-sync unless the screenshot itself looks wrong:

- **`Dialog`, `Sheet`, `CrearFacturaDialog`** — `[RENDER_THIN]` (measured
  height 0px). All three portal their content to `document.body`; the
  measured wrapper element is correctly empty because the visible content
  lives elsewhere in the DOM. Screenshots confirm full, correct render.
- **`SidebarMenuSkeleton`** — `[RENDER_BLANK]` (PNG ~4.8KB, just under the
  5KB heuristic). It's a legitimately tiny component (one shimmer bar, 32px
  tall) — the screenshot shows a correct render, not a blank one.

## Re-sync risks

- The compiled `styles.compiled.css` only contains classes Tailwind's content
  scanner found used *somewhere in the repo* at build time — if a new
  component in the synced set introduces a class not used elsewhere yet, it
  needs the app to actually reference it before a re-sync will pick it up
  (or run the full `npm run build` instead of the standalone CLI, which sees
  more surface).
- `cfg.buildCmd` isn't wired into any `npm run` script — it is two ad hoc
  commands chained with `&&`. If this becomes a recurring sync, promote it to
  a real `package.json` script (`build:ds`) so it's discoverable outside this
  skill's memory.
- `tsconfig.ds-build.json` is a thin fork of the app's `tsconfig.json` for one
  reason (`incremental: false`) — if the app's tsconfig changes structurally,
  re-check this still extends cleanly.

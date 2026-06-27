# Tasks: Gemini SAT Automap Improvements

## Phase 1 — FTS5 Table Setup (`backend/database.py`) ✅
- [x] Add `setup_fts()` function with sentinel table to avoid repeated rebuilds
- [x] Call `setup_fts()` from `create_db()` via `engine.raw_connection()`
- [x] Verified: tables exist and FTS5 MATCH queries return ranked results

## Phase 2 — Module-scope helpers + improved search (`backend/main.py`) ✅
- [x] Move `_norm` to module scope
- [x] Add `_build_fts_query` and `_fts_search` at module scope
- [x] Replace nested `search_sat_catalog` with FTS5 AND→OR→LIKE fallback chain
- [x] Add `search_sat_units` function targeting `sat_unidades_fts`

## Phase 3 — Gemini prompt + tools + loop fixes (`backend/main.py`) ✅
- [x] Add `HS_CHAPTERS` dict (all 97 chapters) and `_chapter_hint()` at module scope
- [x] Combine both tools into a single `types.Tool` with two `FunctionDeclaration`s
- [x] Revise system prompt (unit inference rule, chapter context rule)
- [x] Revise user message (inject chapter hints, new JSON schema with `unit_key`)
- [x] Removed `thinking_config` (thinking re-enabled)
- [x] Add `search_sat_units` branch to tool dispatch
- [x] Add parse-failure retry (up to 2 retries, correction message, loop max → 25)
- [x] Save `unit_key` from Gemini response (drop hardcoded `"H87"`)

## Phase 4 — Improved catalog endpoints (`backend/main.py`) ✅
- [x] `/catalogs/products`: FTS5 OR search + key-prefix shortcut, return 25 rows
- [x] `/catalogs/units`: same pattern for `sat_unidades_fts`

## Phase 5 — Frontend keyboard navigation (`frontend/index.html`) ✅
- [x] Add `.clave-option.kbd-active` CSS rule
- [x] Add `onClaveKeydown` function (ArrowDown, ArrowUp, Enter, Escape)
- [x] Wire `keydown` delegation on `tableWrap`

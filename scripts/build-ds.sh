#!/usr/bin/env bash
# Build the design-system entry for Claude Design sync (see .design-sync/NOTES.md).
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsup src/design-system-entry.ts --format esm --dts --out-dir ds-dist \
  --sourcemap=false --no-splitting --tsconfig tsconfig.ds-build.json

# tsup emits .d.mts for ESM builds; the design-sync converter only scans for
# literal .d.ts files.
cp ds-dist/design-system-entry.d.mts ds-dist/design-system-entry.d.ts

# A real package.json in ds-dist/ makes the converter treat this dir as the
# package root (nearest package.json with a `name`, walking up from --entry)
# instead of falling back to the app's own root package.json, which has no
# `types` field and would resolve to a nonexistent index.d.ts.
cat > ds-dist/package.json <<'EOF'
{
  "name": "pedimentos-v2-ds",
  "version": "0.1.0",
  "main": "design-system-entry.mjs",
  "module": "design-system-entry.mjs",
  "types": "design-system-entry.d.ts"
}
EOF

# Tailwind v4 uses @import "tailwindcss" (not a static file tree the
# converter's CSS scraper can resolve) — compile it to real CSS instead.
npx @tailwindcss/cli -i src/app/globals.css -o ds-dist/styles.compiled.css

echo "✓ ds-dist/ ready"

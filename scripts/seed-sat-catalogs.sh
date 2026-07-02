#!/usr/bin/env bash
# One-off: seed the global sat_claves/sat_unidades reference tables from the
# old FastAPI app's SQLite DB. Skips tables that already have rows, so it's
# safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."
source .env.local

OLD_DB="../AnalizadorDePedimentos/data/db.sqlite"

seed_table() {
  local table="$1"
  local count
  count=$(psql "$DATABASE_URL" -tAc "select count(*) from ${table}")
  if [ "$count" -gt 0 ]; then
    echo "${table}: already has ${count} rows, skipping"
    return
  fi
  sqlite3 -csv -header "$OLD_DB" "select key, description from ${table}" \
    | psql "$DATABASE_URL" -c "\copy ${table}(key, description) from stdin with (format csv, header true)"
}

seed_table sat_claves
seed_table sat_unidades

echo "Done. Row counts:"
psql "$DATABASE_URL" -c "select 'sat_claves' as t, count(*) from sat_claves union all select 'sat_unidades', count(*) from sat_unidades"

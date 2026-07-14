#!/usr/bin/env bash
# Deploys this app to the windows-mini-pc tailscale host, running as two
# Docker containers (app + postgres) inside the Ubuntu-24.04 WSL2 distro
# there (real docker-ce, no Docker Desktop / scheduled-task workaround needed).
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE=windows-mini-pc
WSL_DISTRO=Ubuntu-24.04
REMOTE_DIR=/opt/apps/pedimentos-v2
ENV_FILE=.env.local
PROD_SECRETS_FILE=scripts/.env.prod-secrets

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE - can't build the remote .env from it." >&2
  exit 1
fi

if [ ! -f "$PROD_SECRETS_FILE" ]; then
  echo "Missing $PROD_SECRETS_FILE - can't override prod-only secrets (e.g. Clerk pk_live_/sk_live_ keys)." >&2
  echo "$ENV_FILE has dev keys, which don't work on the production domain - refusing to deploy with them." >&2
  exit 1
fi

remote_wsl() {
  ssh "$REMOTE" "wsl -d $WSL_DISTRO -- bash -c \"$1\""
}

echo "==> Preparing remote env file (rewriting DB host for the docker network)"
TMP_ENV=$(mktemp)
TARBALL=$(mktemp /tmp/pedimentos-deploy-XXXXXX.tar.gz)
trap 'rm -f "$TMP_ENV" "$TARBALL"' EXIT
sed -E \
  -e 's#(DATABASE_URL=.*@)[^:/]+(:[0-9]+)?/#\1postgres:5432/#' \
  -e 's#(APP_DATABASE_URL=.*@)[^:/]+(:[0-9]+)?/#\1postgres:5432/#' \
  "$ENV_FILE" > "$TMP_ENV"

echo "==> Overriding with prod-only secrets from $PROD_SECRETS_FILE"
while IFS='=' read -r key value; do
  [ -z "$key" ] && continue
  case "$key" in \#*) continue ;; esac
  if grep -q "^${key}=" "$TMP_ENV"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$TMP_ENV"
  else
    echo "${key}=${value}" >> "$TMP_ENV"
  fi
done < "$PROD_SECRETS_FILE"

echo "==> Packaging app source"
tar czf "$TARBALL" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=.env.local \
  --exclude='*.tsbuildinfo' \
  .

echo "==> Streaming source to $REMOTE (extracting inside WSL2)"
ssh "$REMOTE" "wsl -d $WSL_DISTRO -- bash -c \"mkdir -p $REMOTE_DIR && tar xzf - -C $REMOTE_DIR\"" < "$TARBALL"

echo "==> Copying env file"
ssh "$REMOTE" "wsl -d $WSL_DISTRO -- bash -c \"cat > $REMOTE_DIR/.env\"" < "$TMP_ENV"

echo "==> Building and starting containers"
remote_wsl "cd $REMOTE_DIR && docker compose up -d --build 2>&1" | tail -40

echo "==> Containers on $REMOTE:"
remote_wsl "cd $REMOTE_DIR && docker compose ps"

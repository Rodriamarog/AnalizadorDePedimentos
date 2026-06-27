#!/bin/bash
# Run manually when ready to deploy to production.
set -e

echo "Deploying to windows-mini-pc..."

scp -i ~/.ssh/id_ed25519 \
  backend/__init__.py \
  backend/main.py \
  backend/parser.py \
  backend/models.py \
  backend/database.py \
  backend/facturapi.py \
  windows-mini-pc:"C:/Users/rodri/pedimentos/backend/"

scp -i ~/.ssh/id_ed25519 \
  frontend/index.html \
  windows-mini-pc:"C:/Users/rodri/pedimentos/frontend/"

scp -i ~/.ssh/id_ed25519 \
  .env \
  windows-mini-pc:"C:/Users/rodri/pedimentos/.env"

scp -i ~/.ssh/id_ed25519 \
  requirements.txt \
  windows-mini-pc:"C:/Users/rodri/pedimentos/requirements.txt"

ssh -i ~/.ssh/id_ed25519 windows-mini-pc \
  "taskkill /F /IM uvicorn.exe & schtasks /run /tn PedimentosApp"

echo "Done. App restarting at https://pedimentos.neurocrow.com"

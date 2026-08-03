# Deploying this app — read this first

If asked to deploy this app (to "the mini pc", "windows-mini-pc", "prod", "my server", or just
"deploy"), **use `scripts/deploy-windows-mini-pc.sh`. Do not hand-roll the tar/scp/ssh steps
yourself**, even if you've read the generic
`/home/rodrigo/code/windows-mini-pc-deployments/DEPLOYMENT_GUIDE.md` and know the general
mini-pc architecture. That file documents the infra-level pattern every app on the box follows;
this app already has that pattern implemented and script-ified, with app-specific logic the
generic guide doesn't know about. Re-deriving the steps by hand skips that logic and produces a
working-looking deploy that's silently wrong.

## Just run it

```bash
./scripts/deploy-windows-mini-pc.sh
```

That's the entire deploy. It:
1. Builds the remote `.env` from local `.env.local`, rewriting `DATABASE_URL`/`APP_DATABASE_URL`
   to the in-network `postgres:5432` host (not `localhost`).
2. Overlays prod-only secrets from `scripts/.env.prod-secrets` (gitignored, not in this repo —
   e.g. live Clerk `pk_live_`/`sk_live_` keys, since `.env.local` has dev keys that don't work on
   the production domain). The script refuses to run if this file is missing rather than
   deploying with dev keys.
3. Tars the repo (excluding `node_modules`, `.next`, `.git`, `.env.local`, `*.tsbuildinfo`) and
   streams it straight through `ssh | wsl tar xzf -` into `/opt/apps/pedimentos-v2` inside the
   `Ubuntu-24.04` WSL2 distro on `windows-mini-pc` — no Windows-temp-dir bridging step, no leftover
   files to clean up afterward.
4. Runs `docker compose up -d --build` remotely and prints `docker compose ps` so you can confirm
   both containers (`app`, `postgres`) came up healthy.

If it fails because `scripts/.env.prod-secrets` is missing, that means prod secrets aren't set up
on this machine — ask the user for them, don't invent a workaround (don't deploy with dev keys,
don't skip the secrets step).

## Database migrations

The script does **not** run migrations — it only ships code and restarts containers. If your
change added a hand-written migration under `drizzle/` (check `package.json`'s `db:*` scripts —
this project applies most schema changes by hand-written SQL run via `psql`, not `drizzle-kit
push`, see the comments at the top of each `drizzle/000N_*.sql` file), you must also apply it to
the **remote** Postgres after deploying:

```bash
ssh windows-mini-pc "wsl -d Ubuntu-24.04 -u rodri -- bash -c \"docker compose -f /opt/apps/pedimentos-v2/docker-compose.yml exec -T postgres psql -U pedimentos -d pedimentos -f - < drizzle/000N_your_migration.sql\""
```

(Adjust the migration filename. Verify with `\d <table>` in psql afterward that the columns
actually landed — don't assume a zero-output `ALTER TABLE ... IF NOT EXISTS` run means it worked
against the right database.) Forgetting this step is the most likely way a deploy "succeeds" (app
container is up, no errors) while the feature is actually broken in prod — the app code will
reference columns that don't exist yet on the remote database.

## Verifying after deploy

```bash
ssh windows-mini-pc "wsl -d Ubuntu-24.04 -u rodri -- bash -c \"docker compose -f /opt/apps/pedimentos-v2/docker-compose.yml ps && curl -s -o /dev/null -w 'local: %{http_code}\\n' http://127.0.0.1:3005\""
```

Both containers should show `Up`/`Up (healthy)`, and the curl should return `200`.

## If the script itself needs changing

It's possible the script is missing something (a new env var, a new migration-application step,
etc.) — if so, fix the script, don't route around it with manual commands. The whole point of it
existing is that the next agent (or the next you, in a future session) doesn't have to
re-figure-out the env-secrets/prod-domain gotchas from scratch. A manual deploy that "worked" this
time is still a regression if it means the script now lies about being the actual deploy process.

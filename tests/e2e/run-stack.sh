#!/usr/bin/env bash
# Boots the full local stack for end-to-end tests:
#   PostgreSQL (port 5499) -> PostgREST (3000) -> fake Supabase gateway (54321) -> Vite app + functions (5173)
# Usage: bash tests/e2e/run-stack.sh   (Ctrl+C or kill the printed PIDs to stop)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/tmp/pgdata
DB=refvault_e2e
P="psql -h /var/tmp -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"

if ! $P -c "select 1" >/dev/null 2>&1; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -E UTF8 --locale=C.UTF-8 >/dev/null && $PGBIN/pg_ctl -D $PGDATA -o '-p 5499 -k /var/tmp' -l $PGDATA/log start" >/dev/null
  sleep 2
fi
$P -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f "$ROOT/tests/sql/supabase_stub.sql"
$P -d $DB -f "$ROOT/tests/e2e/setup-db.sql"
$P -d $DB -f "$ROOT/supabase/migrations/001_init.sql"
$P -d $DB -f "$ROOT/tests/e2e/grants.sql"

SECRET=$(node -e 'import("'"$ROOT"'/tests/e2e/jwt.mjs").then(m=>console.log(m.JWT_SECRET))')
for f in /var/tmp/pgrst/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; done
cat > /var/tmp/pgrst/e2e.conf <<CONF
db-uri = "postgres://authenticator:e2e@127.0.0.1:5499/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3000
CONF
/var/tmp/pgrst/postgrest /var/tmp/pgrst/e2e.conf > /var/tmp/pgrst/log 2>&1 &
PG_PID=$!; echo $PG_PID > /var/tmp/pgrst/postgrest.pid
node "$ROOT/tests/e2e/gateway.mjs" > /var/tmp/pgrst/gateway.log 2>&1 &
GW_PID=$!; echo $GW_PID > /var/tmp/pgrst/gateway.pid
cd "$ROOT"; node tests/e2e/start-app.mjs > /var/tmp/pgrst/app.log 2>&1 &
APP_PID=$!; echo $APP_PID > /var/tmp/pgrst/app.pid
for i in $(seq 1 40); do curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1 && break; sleep 0.5; done
echo "stack up: app http://127.0.0.1:5173  gateway :54321  postgrest :3000  (pids $PG_PID $GW_PID $APP_PID)"

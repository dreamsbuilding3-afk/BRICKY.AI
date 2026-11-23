#!/usr/bin/env bash
# Teste la migration sur une base Postgres locale jetable (aucun accès à Supabase).
# Usage : supabase/tests/local/run.sh   (nécessite initdb/pg_ctl de Postgres 15+)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261123120000_tarifs_leurre_essentiel.sql"
MIGRATION2="$ROOT/supabase/migrations/20261123130000_equipe_agence_herite_plan.sql"
ROLLBACK="$ROOT/supabase/rollback/20261123120000_tarifs_leurre_essentiel_down.sql"
ROLLBACK2="$ROOT/supabase/rollback/20261123130000_equipe_agence_herite_plan_down.sql"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PORT:-54329}"

if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown -R postgres "$WORK"; else RUN=(); fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m fast -w stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)

echo "== 1. Réplique de la production (avant migration)"
"${PSQL[@]}" -f "$HERE/00_baseline_prod.sql"
"${PSQL[@]}" -f "$HERE/05_seed_before.sql"

echo "== 2. Migrations"
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" -f "$MIGRATION2"

echo "== 3. Tests"
"${PSQL[@]}" -f "$HERE/10_tests.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /   /'
echo "== 3b. Tests équipes Agence"
"${PSQL[@]}" -f "$HERE/20_tests_equipe.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /   /'

echo "== 4. Migrations rejouées (idempotence) + tests"
"${PSQL[@]}" -f "$MIGRATION" 2>/dev/null
"${PSQL[@]}" -f "$MIGRATION2" 2>/dev/null
"${PSQL[@]}" -f "$HERE/10_tests.sql" 2>&1 | grep -c '^psql.*NOTICE:  ok' | xargs -I{} echo "   {} vérifications OK au second passage (grille)"
"${PSQL[@]}" -f "$HERE/20_tests_equipe.sql" 2>&1 | grep -c '^psql.*NOTICE:  ok' | xargs -I{} echo "   {} vérifications OK au second passage (équipes)"

echo "== 5. Retour arrière (équipes, puis grille)"
"${PSQL[@]}" -f "$ROLLBACK2" 2>/dev/null
"${PSQL[@]}" -f "$ROLLBACK" 2>/dev/null
"${PSQL[@]}" -c "select plan_code, price_monthly_cents from public.subscription_plans order by sort_order, plan_code" \
  -c "select plan_code, count(*) from public.user_subscriptions group by 1 order by 1"

echo "== Tout est passé."

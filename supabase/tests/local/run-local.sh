#!/usr/bin/env bash
# Runs the real migrations + the security isolation test against a throwaway
# local PostgreSQL (needs `initdb`/`pg_ctl`/`psql` on PATH, e.g.
# `brew install postgresql@16`). Nothing touches your Supabase project.
#
#   supabase/tests/local/run-local.sh
#
# Applies every file in supabase/migrations in order, then runs:
#   security_isolation_test.sql      documents / storage isolation (Phase 1)
#   proposed_health_model_test.sql   health data model integrity + isolation
#   gate1_extraction_test.sql        Gate 1: claim/commit/fail, confidence gate,
#                                    idempotency, assertion, server-only RPCs
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${HI_TEST_PG_PORT:-54329}"

cleanup() {
  pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$WORK/data" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
createdb -h "$WORK" -p "$PORT" hi_test

PSQL=(psql -h "$WORK" -p "$PORT" -d hi_test -v ON_ERROR_STOP=1 -q -X)

echo "▸ Loading Supabase stand-in (auth, storage, API roles)"
"${PSQL[@]}" -f "$HERE/supabase_stub.sql"

for migration in "$SUPABASE_DIR"/migrations/*.sql; do
  echo "▸ Applying $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

echo "▸ Running security isolation test (with Storage writes)"
PGOPTIONS="-c hi_test.storage_writes=on" "${PSQL[@]}" -f "$SUPABASE_DIR/tests/security_isolation_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'

echo "▸ Re-running in hosted mode (no direct Storage writes — as the Supabase SQL Editor will)"
"${PSQL[@]}" -f "$SUPABASE_DIR/tests/security_isolation_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /' | grep -E "FAIL|ERROR|ALL SECURITY"

echo "▸ Running health data model integrity & isolation test"
PGOPTIONS="-c hi_test.storage_writes=on" "${PSQL[@]}" -f "$SUPABASE_DIR/tests/proposed_health_model_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'

echo "▸ Running Gate 1 extraction test"
PGOPTIONS="-c hi_test.storage_writes=on" "${PSQL[@]}" -f "$SUPABASE_DIR/tests/gate1_extraction_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'

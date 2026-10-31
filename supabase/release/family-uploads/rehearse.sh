#!/usr/bin/env bash
# Rehearses 20261103090000 on a throwaway local PostgreSQL: everything before it → precheck → fingerprint →
# apply → verify → fingerprint (must match) → rollback → fingerprint (must match) → apply again.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(cd "$HERE/../.." && pwd)"
FAMILY="$SUPABASE_DIR/release/family"
WORK="$(mktemp -d)"; PORT="${HI_TEST_PG_PORT:-54332}"
cleanup() { pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
initdb -D "$WORK/data" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
createdb -h "$WORK" -p "$PORT" hi_rehearsal
P=(psql -h "$WORK" -p "$PORT" -d hi_rehearsal -v ON_ERROR_STOP=1 -q -X)
NEW=20261103090000_family_report_uploads.sql

"${P[@]}" -f "$SUPABASE_DIR/tests/local/supabase_stub.sql"
for m in "$SUPABASE_DIR"/migrations/*.sql; do
  [[ "$(basename "$m")" == "$NEW" ]] && continue
  "${P[@]}" -f "$m" >/dev/null
done
"${P[@]}" <<'SQL' >/dev/null
insert into auth.users (id, email) select gen_random_uuid(), 'rehearsal-' || g || '@example.invalid' from generate_series(1, 3) g;
do $$
declare u record; d uuid;
begin
  for u in select id from auth.users loop
    insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
      values (u.id, 'r.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into d;
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.observations (origin, name_as_written, value_as_written) values ('user_entered', 'Weight', '70');
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
  end loop;
end $$;
SQL
echo "▸ Precheck (before)";  "${P[@]}" -At -F ' | ' -f "$HERE/precheck.sql"
"${P[@]}" -At -f "$FAMILY/row_fingerprint.sql" > "$WORK/before.txt"
echo "▸ Apply (one transaction, 5 s lock timeout)"
"${P[@]}" -1 -c "set local lock_timeout='5s'" -f "$SUPABASE_DIR/migrations/$NEW"
echo "▸ Verify (after)";     "${P[@]}" -At -F ' | ' -f "$HERE/verify_after.sql"
"${P[@]}" -At -f "$FAMILY/row_fingerprint.sql" > "$WORK/after.txt"
diff "$WORK/before.txt" "$WORK/after.txt" && echo "  fingerprint after apply: IDENTICAL"
echo "▸ Rollback";           "${P[@]}" -f "$HERE/rollback.sql" >/dev/null
"${P[@]}" -At -f "$FAMILY/row_fingerprint.sql" > "$WORK/rolled.txt"
diff "$WORK/before.txt" "$WORK/rolled.txt" && echo "  fingerprint after rollback: IDENTICAL"
"${P[@]}" -At -c "select 'engine_document_identity after rollback: ' || coalesce(to_regprocedure('public.engine_document_identity(uuid,uuid)')::text, 'gone')"
echo "▸ Apply again after rollback"
"${P[@]}" -1 -f "$SUPABASE_DIR/migrations/$NEW"
"${P[@]}" -At -f "$HERE/verify_after.sql" | tail -1
echo "REHEARSAL COMPLETE"

#!/usr/bin/env bash
# Rehearses the family release on a throwaway local PostgreSQL with synthetic data:
# pre-family schema + data → precheck → fingerprint → apply both migrations → verify → fingerprint (must match)
# → rollback → fingerprint (must match) → apply again. Nothing touches Supabase.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"; PORT="${HI_TEST_PG_PORT:-54331}"
cleanup() { pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
initdb -D "$WORK/data" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
createdb -h "$WORK" -p "$PORT" hi_rehearsal
P=(psql -h "$WORK" -p "$PORT" -d hi_rehearsal -v ON_ERROR_STOP=1 -q -X)
FAM1=20261101090000_subjects_foundation.sql; FAM2=20261102090000_family_access.sql

"${P[@]}" -f "$SUPABASE_DIR/tests/local/supabase_stub.sql"
for m in "$SUPABASE_DIR"/migrations/*.sql; do
  b=$(basename "$m"); [[ "$b" == "$FAM1" || "$b" == "$FAM2" ]] && continue
  "${P[@]}" -f "$m" >/dev/null
done
echo "▸ Synthetic data (3 accounts with reports and results) on the pre-family schema"
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
echo "▸ Precheck (before)";   "${P[@]}" -At -F ' | ' -f "$HERE/prod_precheck_single_query.sql"
"${P[@]}" -At -f "$HERE/row_fingerprint.sql" > "$WORK/before.txt"
echo "▸ Apply both migrations (one transaction each, 5 s lock timeout)"
for f in $FAM1 $FAM2; do "${P[@]}" -1 -c "set local lock_timeout='5s'" -f "$SUPABASE_DIR/migrations/$f"; done
echo "▸ Verify (after)";      "${P[@]}" -At -F ' | ' -f "$HERE/verify_after.sql"
"${P[@]}" -At -f "$HERE/row_fingerprint.sql" > "$WORK/after.txt"
diff "$WORK/before.txt" "$WORK/after.txt" && echo "  fingerprint after apply: IDENTICAL"
echo "▸ Rollback";            "${P[@]}" -f "$HERE/rollback_family.sql" >/dev/null
"${P[@]}" -At -f "$HERE/row_fingerprint.sql" > "$WORK/rolled.txt"
diff "$WORK/before.txt" "$WORK/rolled.txt" && echo "  fingerprint after rollback: IDENTICAL"
"${P[@]}" -At -c "select 'family tables after rollback: ' || coalesce(to_regclass('public.subjects')::text, 'gone')"
echo "▸ Apply again after rollback"
for f in $FAM1 $FAM2; do "${P[@]}" -1 -f "$SUPABASE_DIR/migrations/$f"; done
"${P[@]}" -At -f "$HERE/verify_after.sql" | tail -1
echo "REHEARSAL COMPLETE"

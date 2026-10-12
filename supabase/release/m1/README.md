# M1 release SQL

Executed during the review in `docs/M1_PRODUCTION_MIGRATION_REVIEW.md`.

| File | Purpose | Safe on production? |
|---|---|---|
| `prod_precheck.sql` | Pre-deployment state check (migration history, absent M1 objects, function hashes, table sizes, open transactions); expected values in the review §10 | yes (read-only transaction) |
| `row_fingerprint.sql` | Hash of every pre-existing fact/document row — run before and after deploying; must match | yes (read-only) |
| `verify_20261012090000_fact_corrections.sql` | Post-deploy checks for migration 1 (13) | yes (read-only) |
| `verify_20261013090000_corrections_survive_report_deletion.sql` | Post-deploy checks for migration 2 (6) | yes (read-only) |
| `rollback_20261013090000_…sql` | Restores the previous `engine_delete_document` | only with approval |
| `rollback_20261012090000_…sql` | Restores the pre-M1 triggers; drops `correct_fact`, helpers, `correction_reason` (refuses if reasons are stored) | only with approval |
| `isolated_stack_config.toml`, `isolated_stack_seed.sql` | Reproduce the isolated production-like stack | **never** on production |

## Reproduce the review (local only)

```sh
mkdir -p /tmp/m1-review/supabase/migrations
cp supabase/release/m1/isolated_stack_config.toml /tmp/m1-review/supabase/config.toml
cp supabase/migrations/2026*.sql /tmp/m1-review/supabase/migrations/
rm /tmp/m1-review/supabase/migrations/20261012090000_fact_corrections.sql \
   /tmp/m1-review/supabase/migrations/20261013090000_corrections_survive_report_deletion.sql
supabase start --workdir /tmp/m1-review            # ports 56321/56322, separate project id
DB=postgresql://postgres:postgres@127.0.0.1:56322/postgres
psql "$DB" -f supabase/release/m1/isolated_stack_seed.sql
psql "$DB" -At -f supabase/release/m1/row_fingerprint.sql > before.txt
psql "$DB" -1 -v ON_ERROR_STOP=1 -c "set local lock_timeout='5s'" -f supabase/migrations/20261012090000_fact_corrections.sql
psql "$DB" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261013090000_corrections_survive_report_deletion.sql
psql "$DB" -At -f supabase/release/m1/verify_20261012090000_fact_corrections.sql
psql "$DB" -At -f supabase/release/m1/verify_20261013090000_corrections_survive_report_deletion.sql
psql "$DB" -At -f supabase/release/m1/row_fingerprint.sql | diff - before.txt
supabase stop --workdir /tmp/m1-review
```

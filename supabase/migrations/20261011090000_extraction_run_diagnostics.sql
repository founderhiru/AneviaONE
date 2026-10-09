-- =============================================================================
-- Gate 1 · extraction run diagnostics (counts only)
--
-- A run could complete with 0 facts written, held or discarded and no error —
-- indistinguishable from "the report contains nothing". Each run now records
-- what the model returned and what validation did with it, as COUNTS ONLY:
--   { "candidates": { "observations": 12, ... },
--     "accepted": 0, "discarded": 0,
--     "rejected": { "value_not_in_quote": 12, ... } }
-- Never report text, values, names, dates or model output.
--
-- Backward compatible: a new nullable column (existing runs stay NULL) and a
-- new service-role-only writer. No existing function, row or policy changes.
-- The owner can read their runs' diagnostics through the existing RLS SELECT.
-- =============================================================================

alter table public.extraction_runs
  add column diagnostics jsonb
    constraint extraction_runs_diagnostics_shape check (
      diagnostics is null
      or (jsonb_typeof(diagnostics) = 'object' and pg_column_size(diagnostics) <= 4096)
    );

comment on column public.extraction_runs.diagnostics is
  'Counts only: candidates per fact kind returned by the model, accepted, discarded, rejected per reason. Never content.';

-- Written by the process-document Edge Function (service role) only.
create or replace function public.engine_record_run_diagnostics(p_run_id uuid, p_user_id uuid, p_diagnostics jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  update public.extraction_runs r
     set diagnostics = p_diagnostics
   where r.id = p_run_id and r.user_id = p_user_id;
  if not found then
    raise exception 'engine: run not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.engine_record_run_diagnostics(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.engine_record_run_diagnostics(uuid, uuid, jsonb) to service_role;

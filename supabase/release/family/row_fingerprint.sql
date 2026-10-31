-- Family release · row fingerprint of every pre-existing health row, ignoring the NEW columns
-- (subject_id, correction_reason). Run before and after the family migrations: the output must be identical.
-- Read-only; safe on production.
select 'observations' t, count(*) n, md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) h from public.observations x
union all select 'conditions', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) from public.conditions x
union all select 'medications', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) from public.medications x
union all select 'encounters', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) from public.encounters x
union all select 'procedures', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) from public.procedures x
union all select 'allergies', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'correction_reason' - 'subject_id')::text), '' order by x.id), '')) from public.allergies x
union all select 'documents', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'subject_id')::text), '' order by x.id), '')) from public.documents x
union all select 'document_pages', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'subject_id')::text), '' order by x.id), '')) from public.document_pages x
union all select 'extraction_runs', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'subject_id')::text), '' order by x.id), '')) from public.extraction_runs x
union all select 'fact_sources', count(*), md5(coalesce(string_agg(md5((to_jsonb(x) - 'subject_id')::text), '' order by x.id), '')) from public.fact_sources x
union all select 'current_observations', count(*), md5(coalesce(string_agg(x.id::text, '' order by x.id), '')) from public.current_observations x
order by 1;

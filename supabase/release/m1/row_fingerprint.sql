-- Row-level fingerprint of every pre-existing fact/document row (columns that existed before M1).
select 'observations' t, count(*) n, md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) h from public.observations x
union all select 'conditions', count(*), md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) from public.conditions x
union all select 'medications', count(*), md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) from public.medications x
union all select 'encounters', count(*), md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) from public.encounters x
union all select 'procedures', count(*), md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) from public.procedures x
union all select 'allergies', count(*), md5(string_agg(md5((to_jsonb(x) - 'correction_reason')::text), '' order by x.id)) from public.allergies x
union all select 'documents', count(*), md5(string_agg(md5(to_jsonb(x)::text), '' order by x.id)) from public.documents x
union all select 'fact_sources', count(*), md5(string_agg(md5(to_jsonb(x)::text), '' order by x.id)) from public.fact_sources x
union all select 'current_observations', count(*), md5(string_agg(x.id::text, '' order by x.id)) from public.current_observations x
order by 1;

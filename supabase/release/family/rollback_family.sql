-- Family release · ROLLBACK of 20261102090000_family_access.sql and 20261101090000_subjects_foundation.sql.
-- Run ONLY with approval, and only if the family migrations must be undone.
--
-- Refuses if anyone has used the family feature (a relative, an access grant or an open invite exists),
-- so no one's work is lost. It never touches reports, results, files or the audit log.
-- Restores the six current_* views exactly as they were before the family migrations.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.subject_access)
     or exists (select 1 from public.subjects where relationship <> 'self')
     or exists (select 1 from private.access_invites) then
    raise exception 'rollback refused: relatives, access grants or invites exist. Export them first, then change this script on purpose.';
  end if;
end;
$$;

-- 20261102090000 --------------------------------------------------------------
drop function if exists public.create_relative(text, text, date, boolean);
drop function if exists public.create_access_invite(uuid, public.subject_role);
drop function if exists public.redeem_access_invite(text);
drop function if exists public.approve_access(uuid, timestamptz);
drop function if exists public.revoke_access(uuid);
drop function if exists public.list_subject_access(uuid);
drop table if exists private.access_invites;
drop function if exists private.invite_hash(text);

do $$
declare t text;
begin
  foreach t in array array['documents', 'document_pages', 'extraction_runs', 'fact_sources',
                           'observations', 'encounters', 'conditions', 'medications', 'procedures', 'allergies']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_granted', t);
  end loop;
end;
$$;

-- views depend on the subject_id column: drop them, drop the columns, recreate the views as before
drop view if exists public.current_encounters, public.current_observations, public.current_conditions,
                    public.current_medications, public.current_procedures, public.current_allergies;

do $$
declare t text;
begin
  foreach t in array array['documents', 'document_pages', 'extraction_runs', 'fact_sources',
                           'observations', 'encounters', 'conditions', 'medications', 'procedures', 'allergies']
  loop
    execute format('drop trigger if exists zz_fill_subject_id on public.%I', t);
    execute format('alter table public.%I drop column if exists subject_id', t);
  end loop;

  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format($ddl$
      create view public.%1$I with (security_invoker = true) as
        select * from public.%2$I
         where superseded_at is null
           and review_status <> 'rejected'
           and (confidence_gate = 'passed' or review_status = 'confirmed')
    $ddl$, 'current_' || t, t);
    execute format('revoke all on public.%1$I from anon, authenticated', 'current_' || t);
    execute format('grant select on public.%1$I to authenticated', 'current_' || t);
  end loop;
end;
$$;

-- 20261101090000 --------------------------------------------------------------
drop trigger if exists profiles_create_self_subject on public.profiles;
drop function if exists private.profiles_create_self_subject();
drop function if exists private.ensure_self_subject(uuid);
drop function if exists private.fill_subject_id();
drop table if exists public.subject_access;
drop table if exists public.subjects;
drop function if exists private.subject_access_no_self_grant();
drop function if exists public.can_access_subject(uuid, text);
drop type if exists public.subject_access_status;
drop type if exists public.subject_role;

commit;

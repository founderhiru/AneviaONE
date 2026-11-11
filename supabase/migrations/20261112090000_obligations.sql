-- =============================================================================
-- S9 · Obligations ("Coming up"): renewals, refills, follow-ups, due dates.
--
-- An obligation belongs to a PERSON (subject), never to the caregiver who typed it.
--   * source 'user'      : typed by someone with write access; starts 'open'.
--   * source 'extracted' : proposed by report reading (service_role only); starts
--                          'proposed' with its source page and text, and becomes a
--                          reminder only when a person with write access confirms it.
-- AneviaONE never invents a medical due date: every date is from a document or a person.
-- Deleting the source report deletes the obligations derived from it.
-- No notification text lives here; the app composes generic wording on the device.
-- =============================================================================

create table public.obligations (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,
  document_id   uuid references public.documents (id) on delete cascade,
  kind          text not null check (kind in ('renewal', 'refill', 'followup', 'due', 'expiry', 'other')),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  due_on        date not null,
  due_precision text not null default 'day' check (due_precision in ('day', 'month', 'year')),
  source        text not null check (source in ('user', 'extracted')),
  state         text not null check (state in ('proposed', 'open', 'done', 'dismissed')),
  snoozed_until date,
  source_page   integer check (source_page is null or source_page >= 1),
  source_text   text check (source_text is null or char_length(source_text) <= 300),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint obligations_extracted_has_document check (source <> 'extracted' or document_id is not null),
  constraint obligations_user_not_proposed check (source <> 'user' or state <> 'proposed'),
  constraint obligations_done_has_time check ((state = 'done') = (completed_at is not null))
);

create index obligations_subject_due_idx on public.obligations (subject_id, due_on) where state = 'open';
create index obligations_document_idx on public.obligations (document_id) where document_id is not null;

-- Identity of an obligation never changes after creation; only its state, date,
-- title and snooze do. Extracted obligations cannot be relabelled as user-typed.
create or replace function private.obligations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.subject_id is distinct from old.subject_id
       or new.document_id is distinct from old.document_id
       or new.source is distinct from old.source
       or new.created_by is distinct from old.created_by
       or new.source_page is distinct from old.source_page
       or new.source_text is distinct from old.source_text then
      raise exception 'obligation identity cannot be changed';
    end if;
    if new.state = 'done' and old.state <> 'done' then new.completed_at := now(); end if;
    if new.state <> 'done' then new.completed_at := null; end if;
    new.updated_at := now();
  end if;
  return new;
end
$$;

create trigger obligations_guard
  before update on public.obligations
  for each row execute function private.obligations_guard();

alter table public.obligations enable row level security;

create policy "obligations_select_accessible"
  on public.obligations for select to authenticated
  using (public.can_access_subject(subject_id, 'read'));

-- The app may only create user-typed, open obligations for people it can write for.
create policy "obligations_insert_user_typed"
  on public.obligations for insert to authenticated
  with check (
    public.can_access_subject(subject_id, 'write')
    and source = 'user' and state = 'open'
    and created_by = (select auth.uid())
    and document_id is null
  );

create policy "obligations_update_writers"
  on public.obligations for update to authenticated
  using (public.can_access_subject(subject_id, 'write'))
  with check (public.can_access_subject(subject_id, 'write'));

create policy "obligations_delete_writers"
  on public.obligations for delete to authenticated
  using (public.can_access_subject(subject_id, 'write'));

revoke all on public.obligations from anon;
grant select, insert, update, delete on public.obligations to authenticated;
grant all on public.obligations to service_role;

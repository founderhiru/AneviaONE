-- =============================================================================
-- Reports are no longer held for review just because they name no one.
--
-- Until now a report's results entered trusted Health Memory only when its
-- patient name / date of birth matched the profile. Real reports (photos,
-- scans, labs that print only an ID) usually could not be matched, so almost
-- every result was held, and the identity safeguard then blocked confirming or
-- correcting it: a dead end.
--
-- Now only a contradiction (a different date of birth, or a name sharing no
-- word with the profile) stops a report. A report that names no one, or can't
-- be matched, is recorded as 'owner_attested': the person filed it under their
-- own record (or one they manage) and nothing on the page contradicts it.
-- Results are held for review only when the page itself is unclear.
--
-- Existing documents keep their recorded value. Reading one again ("Read again"
-- on the report) applies the new rule. The old values stay valid in the check.
--
-- ROLLBACK: update documents set identity_check = 'unverifiable'
--           where identity_check = 'owner_attested';
--           alter table ... drop constraint ..., re-add without 'owner_attested'.
-- =============================================================================

alter table public.documents drop constraint documents_identity_check_check;
alter table public.documents add constraint documents_identity_check_check
  check (identity_check in ('not_checked', 'no_identifiers', 'consistent', 'unverifiable', 'mismatch', 'owner_attested'));

comment on column public.documents.identity_check is
  'Result of comparing explicit patient identifiers in the report with the account. owner_attested = the report names no one or could not be matched, and was filed under the person''s own record. Never stores the identifiers.';

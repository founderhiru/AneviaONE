-- =============================================================================
-- DEMO REMINDERS — fills "Coming up" for the demo account (you, Mother, Father).
--
-- Run AFTER demo_account.sql, on the same demo account only. All reminders are
-- synthetic. Dates are relative to today, so one overdue, a few due this week
-- and some later ones appear whenever you run it.
--
-- HOW TO USE
--   1. Put the demo account's email on the line marked  <<< EDIT  below.
--   2. Paste this whole file into the Supabase SQL Editor and run it once.
--   3. Open the app signed in as the demo account; switch between people.
--
-- It refuses to run on an account that is not the demo account (it looks for the
-- two relatives demo_account.sql creates), and refuses to run twice.
--
-- TO REMOVE: delete the demo account in the app (Me > Delete account), or run
--   delete from public.obligations where subject_id in (<the three people>);
-- =============================================================================
do $seed$
declare
  demo_email text := 'demo@example.com';  -- <<< EDIT: the email of the demo account
  me uuid; me_sub uuid; dad_sub uuid; mom_sub uuid;
begin
  select id into me from auth.users where lower(email) = lower(demo_email);
  if me is null then
    raise exception 'No account with the email %. Edit demo_email at the top.', demo_email;
  end if;

  select id into me_sub  from public.subjects where linked_user_id = me;
  select id into dad_sub from public.subjects where created_by = me and display_name = 'Ramesh Verma' and relationship = 'father';
  select id into mom_sub from public.subjects where created_by = me and display_name = 'Sunita Verma' and relationship = 'mother';
  if me_sub is null or dad_sub is null or mom_sub is null then
    raise exception 'This is not the demo account. Run demo_account.sql on it first.';
  end if;
  if exists (select 1 from public.obligations where subject_id in (me_sub, dad_sub, mom_sub)) then
    raise exception 'Demo reminders already exist on this account.';
  end if;

  insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state) values
    (me_sub,  me, 'followup', 'Repeat vitamin D test',            current_date - 2,  'user', 'open'),
    (me_sub,  me, 'renewal',  'Renew family health insurance',     current_date + 12, 'user', 'open'),
    (me_sub,  me, 'followup', 'Annual check-up with Doctor',       current_date + 45, 'user', 'open'),
    (dad_sub, me, 'refill',   'Blood pressure medicine refill',    current_date + 4,  'user', 'open'),
    (dad_sub, me, 'followup', 'Diabetes follow-up visit',          current_date + 20, 'user', 'open'),
    (dad_sub, me, 'due',      'HbA1c test due',                    current_date + 60, 'user', 'open'),
    (mom_sub, me, 'refill',   'Thyroid medicine refill',           current_date + 6,  'user', 'open'),
    (mom_sub, me, 'followup', 'Bone density review with Doctor',   current_date + 90, 'user', 'open');

  raise notice 'Added 8 demo reminders for you, Father and Mother.';
end
$seed$;

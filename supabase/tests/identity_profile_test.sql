-- =============================================================================
-- Phase D · identity profile (full name + date of birth). Synthetic users
-- only; runs inside a transaction that is ROLLED BACK. Success ends with
-- "ALL IDENTITY PROFILE CHECKS PASSED".
--
-- Local: supabase/tests/local/run-local.sh
-- =============================================================================

begin;

create function pg_temp.act_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end
$$;

create function pg_temp.expect_blocked(label text, stmt text) returns void
language plpgsql as $$
declare
  affected bigint;
begin
  begin
    execute stmt;
    get diagnostics affected = row_count;
  exception when others then
    raise notice 'PASS  %  (refused: %)', label, sqlerrm;
    return;
  end;
  if affected = 0 then
    raise notice 'PASS  %  (no rows affected)', label;
    return;
  end if;
  raise exception 'FAIL  %  — was allowed and affected % row(s)', label, affected;
end
$$;

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL  %', label;
  end if;
  raise notice 'PASS  %', label;
end
$$;

do $$
declare
  tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end
$$;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  audit_before bigint;
  ident jsonb;
  err text;
begin
  insert into auth.users (id, email) values (a, 'identity-a@example.invalid'), (b, 'identity-b@example.invalid');
  select count(*) into audit_before from public.audit_logs where user_id in (a, b);

  -- ------------------------------------------------ new / existing users ---
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('a new user has no full name and no date of birth (nothing invented)',
    (select full_name is null from public.profiles where id = a)
    and not exists (select 1 from public.health_profiles where user_id = a));
  perform pg_temp.expect_true('…and the email address is not used as a name',
    (select coalesce(full_name, display_name) is null from public.profiles where id = a));

  -- ------------------------------------------------------- saving --------
  perform public.set_my_identity('  Test Person Alpha  ', null);
  perform pg_temp.expect_true('a full name alone can be saved (surrounding spaces trimmed, otherwise as entered)',
    (select full_name = 'Test Person Alpha' from public.profiles where id = a));
  perform public.set_my_identity('Test Person Alpha', date '1990-02-28');
  perform pg_temp.expect_true('a date of birth can be saved with the name (as a DATE)',
    (select date_of_birth = date '1990-02-28' from public.health_profiles where user_id = a));
  perform public.set_my_identity(null, date '2000-02-29');
  perform pg_temp.expect_true('a leap-day date of birth is a real date and is kept; NULL clears the name',
    (select date_of_birth = date '2000-02-29' from public.health_profiles where user_id = a)
    and (select full_name is null from public.profiles where id = a));
  perform public.set_my_identity('Ána-Lúcia O''Brien-Nakamura', date '2000-02-29');
  perform pg_temp.expect_true('names are stored exactly as entered (accents, apostrophes, hyphens)',
    (select full_name = 'Ána-Lúcia O''Brien-Nakamura' from public.profiles where id = a));
  perform pg_temp.expect_true('the person can read their own identity details',
    (select count(*) from public.profiles where full_name is not null) = 1
    and (select count(*) from public.health_profiles) = 1);

  -- ----------------------------------------------------- validation -------
  perform pg_temp.expect_blocked('an empty (spaces-only) name is refused',
    $q$select public.set_my_identity('   ', null)$q$);
  perform pg_temp.expect_blocked('a name with control characters is refused',
    format('select public.set_my_identity(%L, null)', 'Test' || chr(10) || 'Person'));
  perform pg_temp.expect_blocked('an over-long name is refused',
    format('select public.set_my_identity(%L, null)', repeat('x', 201)));
  perform pg_temp.expect_blocked('a date of birth in the future is refused',
    format('select public.set_my_identity(null, %L::date)', current_date + 1));
  perform pg_temp.expect_blocked('an impossible date (30 February) is refused',
    $q$select public.set_my_identity(null, '2023-02-30'::date)$q$);
  perform pg_temp.expect_blocked('a date of birth before 1900 is refused',
    $q$select public.set_my_identity(null, '1899-12-31'::date)$q$);
  perform pg_temp.expect_blocked('a future date of birth is refused on a direct update too',
    format('update public.health_profiles set date_of_birth = %L', current_date + 30));
  begin
    perform public.set_my_identity(null, current_date + 1);
  exception when others then
    err := sqlerrm;
  end;
  perform pg_temp.expect_true('the refusal message does not echo the date', position((current_date + 1)::text in err) = 0);
  begin
    perform public.set_my_identity(repeat('Q', 201), null);
  exception when others then
    get stacked diagnostics err = pg_exception_detail;
    err := coalesce(err, '') || sqlerrm;
  end;
  perform pg_temp.expect_true('a refused name is not echoed in the error (message or detail)', position('QQQQ' in err) = 0);
  begin
    perform public.set_my_identity(null, date '1899-12-31');
  exception when others then
    get stacked diagnostics err = pg_exception_detail;
    err := coalesce(err, '') || sqlerrm;
  end;
  perform pg_temp.expect_true('a refused date of birth is not echoed in the error (message or detail)', position('1899' in err) = 0);
  perform pg_temp.expect_true('after refused attempts, the saved values are unchanged',
    (select full_name = 'Ána-Lúcia O''Brien-Nakamura' from public.profiles where id = a)
    and (select date_of_birth = date '2000-02-29' from public.health_profiles where user_id = a));
  reset role;

  -- ------------------------------------------------------- isolation ------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('B cannot read A''s full name',
    not exists (select 1 from public.profiles where id = a));
  perform pg_temp.expect_true('B cannot read A''s date of birth',
    not exists (select 1 from public.health_profiles where user_id = a));
  perform pg_temp.expect_blocked('B cannot change A''s full name',
    format($q$update public.profiles set full_name = 'Changed' where id = %L$q$, a));
  perform pg_temp.expect_blocked('B cannot change A''s date of birth',
    format($q$update public.health_profiles set date_of_birth = '1970-01-01' where user_id = %L$q$, a));
  perform pg_temp.expect_blocked('B cannot create a date of birth for A',
    format($q$insert into public.health_profiles (user_id, date_of_birth) values (%L, '1970-01-01')$q$, a));
  perform public.set_my_identity('Test Person Beta', date '1985-07-01');
  reset role;
  perform pg_temp.expect_true('B saving their own details changes only B',
    (select full_name = 'Ána-Lúcia O''Brien-Nakamura' from public.profiles where id = a)
    and (select date_of_birth = date '2000-02-29' from public.health_profiles where user_id = a)
    and (select full_name = 'Test Person Beta' from public.profiles where id = b));

  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous callers cannot save identity details',
    $q$select public.set_my_identity('Someone', null)$q$);
  perform pg_temp.expect_blocked('anonymous callers cannot read profiles', 'select full_name from public.profiles');
  reset role;

  -- ------------------------------------------ server read (later phases) --
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot use the server identity read',
    format('select public.engine_account_identity(%L)', b));
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  ident := public.engine_account_identity(a);
  perform pg_temp.expect_true('server code reads the stored values as they are (no matching, no normalising)',
    ident = jsonb_build_object('full_name', 'Ána-Lúcia O''Brien-Nakamura', 'date_of_birth', '2000-02-29'));
  perform pg_temp.expect_true('a person with nothing saved reads as nulls',
    public.engine_account_identity(gen_random_uuid()) = jsonb_build_object('full_name', null, 'date_of_birth', null));
  reset role;

  -- ------------------------------------------------------------ privacy --
  perform pg_temp.expect_true('saving identity details writes no audit rows (no name or DOB in audit_logs)',
    (select count(*) from public.audit_logs where user_id in (a, b)) = audit_before
    and not exists (select 1 from public.audit_logs where details::text ~ '(Alpha|Beta|O''Brien|2000-02-29|1985-07-01)'));

  raise notice '==============================================';
  raise notice 'ALL IDENTITY PROFILE CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;

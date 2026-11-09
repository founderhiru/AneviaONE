-- =============================================================================
-- DEMO ACCOUNT — a fully populated test profile (you, plus Mother and Father).
--
-- WHAT IT MAKES (all synthetic; nothing here is real medical data):
--   You  (Asha Verma)  6 lab reports over two years (same 11 tests every time, so
--                      every graph, trend and "what changed" card fills in),
--                      3 imaging reports (echo, chest X-ray, ultrasound), medicines,
--                      conditions, an allergy, a vaccination, a doctor visit, and ONE
--                      result held for review so you can see the review flow.
--   Father (Ramesh)    4 lab reports (diabetes + blood pressure), an ECG, medicines.
--   Mother (Sunita)    4 lab reports (thyroid, vitamin D), a bone-density scan, medicines.
--
-- HOW TO USE
--   1. In the app, sign up a NEW account (e.g. yourname+demo@gmail.com). Never run
--      this on an account that holds real reports.
--   2. Put that email on the line marked  <<< EDIT  below.
--   3. Paste this whole file into the Supabase SQL Editor and run it once.
--   4. Open the app signed in as that account.
--
-- NOTES
--   * Reports are recorded through the same server functions the real reader uses,
--     so they look exactly like reports that were uploaded and read.
--   * There is no original PDF behind them, so "View original" will not open one.
--   * Running it twice on the same account is refused (no duplicates).
--
-- TO REMOVE EVERYTHING AGAIN: delete the demo account in the app (Me > Delete account),
-- or delete its reports one by one. Nothing else is touched.
-- =============================================================================
do $seed$
declare
  demo_email text := 'demo@example.com';  -- <<< EDIT: the email of the account you signed up
  me uuid; mom uuid; dad uuid;
  sub uuid; who text; r jsonb; t jsonb; i int; n int;
  doc uuid; run uuid; payload jsonb; obs jsonb; lines jsonb; txt text; fp text; held boolean;
  dates date[] := array[date '2024-11-12', date '2025-03-18', date '2025-07-22', date '2025-11-25', date '2026-03-10', date '2026-08-14'];

  -- Lab series: name, unit, printed low, printed high, category, values per visit.
  me_labs jsonb := '[
    {"n":"HbA1c","u":"%","lo":4.0,"hi":5.6,"c":"laboratory","v":[6.1,6.0,5.9,5.8,5.7,5.6]},
    {"n":"Fasting Glucose","u":"mg/dL","lo":70,"hi":99,"c":"laboratory","v":[118,112,108,104,101,98]},
    {"n":"Total Cholesterol","u":"mg/dL","lo":0,"hi":200,"c":"laboratory","v":[221,212,205,198,190,184]},
    {"n":"LDL Cholesterol","u":"mg/dL","lo":0,"hi":100,"c":"laboratory","v":[142,131,124,118,109,101]},
    {"n":"HDL Cholesterol","u":"mg/dL","lo":40,"hi":100,"c":"laboratory","v":[44,45,47,48,50,52]},
    {"n":"Triglycerides","u":"mg/dL","lo":0,"hi":150,"c":"laboratory","v":[190,176,165,150,142,138]},
    {"n":"Haemoglobin","u":"g/dL","lo":12.0,"hi":15.5,"c":"laboratory","v":[12.1,12.4,12.8,12.9,13.1,13.2]},
    {"n":"TSH","u":"uIU/mL","lo":0.4,"hi":4.0,"c":"laboratory","v":[4.8,4.2,3.9,3.5,3.1,2.9]},
    {"n":"Vitamin D (25-OH)","u":"ng/mL","lo":30,"hi":100,"c":"laboratory","v":[14,19,24,29,33,38]},
    {"n":"Serum Creatinine","u":"mg/dL","lo":0.6,"hi":1.1,"c":"laboratory","v":[0.9,0.9,0.8,0.9,0.8,0.8]},
    {"n":"Weight","u":"kg","lo":null,"hi":null,"c":"vital_sign","v":[78.5,77.2,76.0,74.8,73.6,72.4]},
    {"n":"Systolic Blood Pressure","u":"mmHg","lo":90,"hi":120,"c":"vital_sign","v":[138,134,130,128,124,122]}
  ]';
  dad_labs jsonb := '[
    {"n":"HbA1c","u":"%","lo":4.0,"hi":5.6,"c":"laboratory","v":[8.2,7.8,7.5,7.1]},
    {"n":"Fasting Glucose","u":"mg/dL","lo":70,"hi":99,"c":"laboratory","v":[168,152,141,132]},
    {"n":"LDL Cholesterol","u":"mg/dL","lo":0,"hi":100,"c":"laboratory","v":[118,102,96,88]},
    {"n":"Serum Creatinine","u":"mg/dL","lo":0.7,"hi":1.3,"c":"laboratory","v":[1.3,1.3,1.2,1.2]},
    {"n":"Haemoglobin","u":"g/dL","lo":13.0,"hi":17.0,"c":"laboratory","v":[12.6,12.9,13.2,13.4]},
    {"n":"Systolic Blood Pressure","u":"mmHg","lo":90,"hi":120,"c":"vital_sign","v":[152,146,140,134]}
  ]';
  mom_labs jsonb := '[
    {"n":"TSH","u":"uIU/mL","lo":0.4,"hi":4.0,"c":"laboratory","v":[6.8,5.9,4.6,3.2]},
    {"n":"Vitamin D (25-OH)","u":"ng/mL","lo":30,"hi":100,"c":"laboratory","v":[12,18,26,34]},
    {"n":"Calcium","u":"mg/dL","lo":8.5,"hi":10.5,"c":"laboratory","v":[8.6,8.9,9.1,9.3]},
    {"n":"Haemoglobin","u":"g/dL","lo":12.0,"hi":15.5,"c":"laboratory","v":[11.2,11.6,12.0,12.3]},
    {"n":"LDL Cholesterol","u":"mg/dL","lo":0,"hi":100,"c":"laboratory","v":[128,121,113,104]},
    {"n":"Systolic Blood Pressure","u":"mmHg","lo":90,"hi":120,"c":"vital_sign","v":[132,130,126,124]}
  ]';

  -- One-off reports: who, date, filename, narrative/numeric items, plus other facts.
  extras jsonb := '[
    {"w":"me","d":"2025-11-25","f":"Echocardiogram Report.pdf","obs":[
        ["Left Ventricular Ejection Fraction","62","%","imaging",55,70],
        ["Aortic Valve","Normal",null,"imaging",null,null],["Mitral Valve","Normal",null,"imaging",null,null],
        ["Tricuspid Valve","Normal",null,"imaging",null,null],["Pulmonary Valve","Normal",null,"imaging",null,null],
        ["Impression","Normal study. No regional wall motion abnormality.",null,"imaging",null,null]],
      "enc":["consultation","Dr. S. Rao","Sunrise Heart Clinic"],
      "proc":[["Influenza vaccine","immunization"]]},
    {"w":"me","d":"2026-03-10","f":"Chest X-ray Report.pdf","obs":[
        ["Lung Fields","Clear",null,"imaging",null,null],["Heart Size","Normal",null,"imaging",null,null],
        ["Impression","No active cardiopulmonary disease.",null,"imaging",null,null]]},
    {"w":"me","d":"2026-08-14","f":"Abdominal Ultrasound.pdf","obs":[
        ["Liver","Normal in size and echotexture",null,"imaging",null,null],["Gallbladder","Normal, no stones",null,"imaging",null,null],
        ["Kidneys","Normal",null,"imaging",null,null],["Serum Ferritin","unclear on the photo","ng/mL","laboratory",null,null]],
      "held":"Serum Ferritin"},
    {"w":"dad","d":"2026-02-09","f":"ECG Report.pdf","obs":[
        ["Heart Rate","76","bpm","other",60,100],["Rhythm","Sinus rhythm",null,"other",null,null],
        ["QRS","92","ms","other",null,null],["Impression","Normal ECG.",null,"other",null,null]]},
    {"w":"mom","d":"2026-05-04","f":"Bone Density (DEXA) Report.pdf","obs":[
        ["Lumbar Spine T-score","-1.8",null,"imaging",null,null],["Hip T-score","-1.2",null,"imaging",null,null],
        ["Impression","Low bone mass (osteopenia) at the lumbar spine.",null,"imaging",null,null]]}
  ]';

  -- Conditions / medicines / allergies attached to a lab report (who, visit index, kind, a, b).
  others jsonb := '[
    {"w":"me","i":0,"k":"conditions","a":"Prediabetes"},{"w":"me","i":0,"k":"conditions","a":"Vitamin D deficiency"},
    {"w":"me","i":0,"k":"allergies","a":"Penicillin","b":"rash"},
    {"w":"me","i":1,"k":"medications","a":"Vitamin D3","b":"60000 IU once a week"},
    {"w":"me","i":2,"k":"medications","a":"Atorvastatin","b":"10 mg once daily"},
    {"w":"dad","i":0,"k":"conditions","a":"Type 2 diabetes mellitus"},{"w":"dad","i":0,"k":"conditions","a":"Hypertension"},
    {"w":"dad","i":0,"k":"medications","a":"Metformin","b":"500 mg twice daily"},
    {"w":"dad","i":0,"k":"medications","a":"Amlodipine","b":"5 mg once daily"},
    {"w":"mom","i":0,"k":"conditions","a":"Hypothyroidism"},
    {"w":"mom","i":0,"k":"medications","a":"Levothyroxine","b":"75 mcg once daily"},
    {"w":"mom","i":1,"k":"medications","a":"Calcium with Vitamin D3","b":"500 mg once daily"},
    {"w":"mom","i":0,"k":"allergies","a":"Sulfa drugs","b":"skin rash"}
  ]';

  spec jsonb;
  specs jsonb := '[]'::jsonb;
  lab_idx int; vis_date date; vis_name text;
begin
  select id into me from auth.users where lower(email) = lower(demo_email);
  if me is null then
    raise exception 'No account with the email %. Sign up in the app first, then edit demo_email at the top.', demo_email;
  end if;
  if exists (select 1 from public.documents where user_id = me) then
    raise exception 'This account already has reports. The demo is only added to an empty account.';
  end if;

  update public.profiles set full_name = 'Asha Verma' where id = me;

  -- Parents, as relatives you manage.
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  dad := public.create_relative('Ramesh Verma', 'father', date '1954-02-03', true);
  mom := public.create_relative('Sunita Verma', 'mother', date '1958-06-21', true);
  execute 'reset role';

  -- Build the list of reports to record.
  for i in 1..6 loop
    specs := specs || jsonb_build_object('w', 'me', 'd', dates[i], 'f', 'Lab Report ' || to_char(dates[i], 'Mon YYYY') || '.pdf', 'series', me_labs, 'idx', i - 1);
  end loop;
  for i in 1..4 loop
    specs := specs || jsonb_build_object('w', 'dad', 'd', (array[date '2025-02-10', date '2025-08-18', date '2026-02-09', date '2026-09-21'])[i],
      'f', 'Lab Report ' || to_char((array[date '2025-02-10', date '2025-08-18', date '2026-02-09', date '2026-09-21'])[i], 'Mon YYYY') || '.pdf', 'series', dad_labs, 'idx', i - 1);
    specs := specs || jsonb_build_object('w', 'mom', 'd', (array[date '2025-01-20', date '2025-07-14', date '2026-01-12', date '2026-08-03'])[i],
      'f', 'Lab Report ' || to_char((array[date '2025-01-20', date '2025-07-14', date '2026-01-12', date '2026-08-03'])[i], 'Mon YYYY') || '.pdf', 'series', mom_labs, 'idx', i - 1);
  end loop;
  for r in select * from jsonb_array_elements(extras) loop
    specs := specs || jsonb_build_object('w', r ->> 'w', 'd', r ->> 'd', 'f', r ->> 'f', 'extra', r);
  end loop;

  execute 'set local role service_role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  for spec in select * from jsonb_array_elements(specs) loop
    who := spec ->> 'w';
    sub := case who when 'dad' then dad when 'mom' then mom else null end;
    vis_date := (spec ->> 'd')::date;
    obs := '[]'::jsonb; lines := '[]'::jsonb;

    if spec ? 'series' then
      for t in select * from jsonb_array_elements(spec -> 'series') loop
        txt := (t ->> 'n') || ' ' || ((t -> 'v') ->> (spec ->> 'idx')::int) || ' ' || (t ->> 'u')
               || case when t ->> 'lo' is not null then ' (' || (t ->> 'lo') || '-' || (t ->> 'hi') || ')' else '' end;
        lines := lines || to_jsonb(txt);
        fp := md5(who || (spec ->> 'f') || (t ->> 'n')) || md5((t ->> 'n') || who || (spec ->> 'f'));
        obs := obs || jsonb_build_object('page_number', 1, 'source_text', txt, 'confidence', 0.96, 'confidence_gate', 'passed',
          'fact_fingerprint', fp, 'name_as_written', t ->> 'n', 'value_as_written', (t -> 'v') ->> (spec ->> 'idx')::int,
          'unit_as_written', t ->> 'u', 'reference_range_as_written', case when t ->> 'lo' is not null then (t ->> 'lo') || ' - ' || (t ->> 'hi') end,
          'effective_date', vis_date, 'category', t ->> 'c',
          'value_numeric', ((t -> 'v') ->> (spec ->> 'idx')::int)::numeric, 'value_normalized', ((t -> 'v') ->> (spec ->> 'idx')::int)::numeric,
          'unit_normalized', t ->> 'u', 'reference_low', (t ->> 'lo')::numeric, 'reference_high', (t ->> 'hi')::numeric,
          'interpretation_version', 'n1');
      end loop;
    else
      for t in select * from jsonb_array_elements(spec -> 'extra' -> 'obs') loop
        held := (spec -> 'extra' ->> 'held') is not null and (t ->> 0) = (spec -> 'extra' ->> 'held');
        txt := (t ->> 0) || ' ' || (t ->> 1) || coalesce(' ' || (t ->> 2), '');
        lines := lines || to_jsonb(txt);
        fp := md5(who || (spec ->> 'f') || (t ->> 0)) || md5((t ->> 0) || who || (spec ->> 'f'));
        obs := obs || jsonb_build_object('page_number', 1, 'source_text', txt,
          'confidence', case when held then 0.52 else 0.95 end, 'confidence_gate', case when held then 'needs_review' else 'passed' end,
          'fact_fingerprint', fp, 'name_as_written', t ->> 0, 'value_as_written', t ->> 1, 'unit_as_written', t ->> 2,
          'effective_date', vis_date, 'category', t ->> 3,
          'value_numeric', case when (t ->> 1) ~ '^-?[0-9]+(\.[0-9]+)?$' then (t ->> 1)::numeric end,
          'value_normalized', case when (t ->> 1) ~ '^-?[0-9]+(\.[0-9]+)?$' and t ->> 2 is not null then (t ->> 1)::numeric end,
          'unit_normalized', t ->> 2, 'reference_low', (t ->> 4)::numeric, 'reference_high', (t ->> 5)::numeric,
          'reference_range_as_written', case when t ->> 4 is not null then (t ->> 4) || ' - ' || (t ->> 5) end,
          'interpretation_version', 'n1');
      end loop;
    end if;

    payload := jsonb_build_object('report_date', vis_date, 'identity_check', 'consistent', 'text_layer', 'present', 'chunk_count', 1,
      'facts_discarded', 0, 'observations', obs, 'conditions', '[]'::jsonb, 'medications', '[]'::jsonb, 'allergies', '[]'::jsonb,
      'procedures', '[]'::jsonb, 'encounters', '[]'::jsonb);

    -- Conditions, medicines, allergies on the first visits of a series.
    for t in select * from jsonb_array_elements(others) loop
      if (t ->> 'w') = who and spec ? 'idx' and (t ->> 'i')::int = (spec ->> 'idx')::int then
        txt := (t ->> 'a') || coalesce(' ' || (t ->> 'b'), '');
        lines := lines || to_jsonb(txt);
        fp := md5('o' || who || (t ->> 'k') || (t ->> 'a')) || md5((t ->> 'a') || (t ->> 'k') || who);
        payload := jsonb_set(payload, array[t ->> 'k'], (payload -> (t ->> 'k')) || case t ->> 'k'
          when 'conditions' then jsonb_build_object('page_number', 1, 'source_text', txt, 'confidence', 0.93, 'confidence_gate', 'passed',
            'fact_fingerprint', fp, 'name_as_written', t ->> 'a', 'assertion', 'diagnosed', 'recorded_date', vis_date)
          when 'medications' then jsonb_build_object('page_number', 1, 'source_text', txt, 'confidence', 0.93, 'confidence_gate', 'passed',
            'fact_fingerprint', fp, 'name_as_written', t ->> 'a', 'dose_as_written', t ->> 'b', 'status', 'active', 'start_date', vis_date)
          else jsonb_build_object('page_number', 1, 'source_text', txt, 'confidence', 0.93, 'confidence_gate', 'passed',
            'fact_fingerprint', fp, 'substance_as_written', t ->> 'a', 'reaction_as_written', t ->> 'b', 'assertion', 'reported')
        end);
      end if;
    end loop;

    -- One-off reports: visit and vaccination.
    if spec -> 'extra' ? 'enc' then
      payload := jsonb_set(payload, '{encounters}', jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', 'Consultation, ' || (spec -> 'extra' -> 'enc' ->> 1),
        'confidence', 0.94, 'confidence_gate', 'passed', 'fact_fingerprint', md5('enc' || (spec ->> 'f')) || md5((spec ->> 'f') || 'enc'),
        'encounter_date', vis_date, 'encounter_type', spec -> 'extra' -> 'enc' ->> 0, 'provider_name', spec -> 'extra' -> 'enc' ->> 1,
        'facility_name', spec -> 'extra' -> 'enc' ->> 2)));
    end if;
    if spec -> 'extra' ? 'proc' then
      payload := jsonb_set(payload, '{procedures}', jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', spec -> 'extra' -> 'proc' -> 0 ->> 0,
        'confidence', 0.93, 'confidence_gate', 'passed', 'fact_fingerprint', md5('proc' || (spec ->> 'f')) || md5((spec ->> 'f') || 'proc'),
        'name_as_written', spec -> 'extra' -> 'proc' -> 0 ->> 0, 'performed_date', vis_date, 'procedure_kind', spec -> 'extra' -> 'proc' -> 0 ->> 1)));
    end if;

    payload := jsonb_set(payload, '{pages}', jsonb_build_array(jsonb_build_object('page_number', 1,
      'text', (spec ->> 'f') || E'\n' || (select string_agg(x, E'\n') from jsonb_array_elements_text(lines) x))));

    insert into public.documents (user_id, subject_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
    values (me, sub, spec ->> 'f', 'application/pdf', 48000, 'uploaded', vis_date::timestamptz + interval '10 hours') returning id into doc;
    perform public.engine_claim_document(doc, me);
    run := public.engine_start_run(doc, me, 'g1.0', 'demo', 'demo-seed', 'demo', 'ai-2026-10');
    perform public.engine_complete_document(run, me, payload);
    n := coalesce(n, 0) + 1;
  end loop;

  execute 'reset role';
  raise notice 'Demo ready: % reports recorded for %, with Father and Mother added. Open the app signed in as this account.', n, demo_email;
end
$seed$;

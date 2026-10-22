create extension if not exists pgtap with schema extensions;

begin;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', now(), now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}';

-- Input rules for GCC forwarding
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.204032, 13.05202, array['aaaaaaaa-0000-0000-0000-000000000001/a.jpg'],
       p_gcc_street_id => '7553') $$,
  'P0001', 'INVALID_INPUT', 'a report without a gender raises INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.204032, 13.05202, array['aaaaaaaa-0000-0000-0000-000000000001/a.jpg'],
       p_gender => 'other', p_gcc_street_id => '7553') $$,
  'P0001', 'INVALID_INPUT', 'a gender outside male/female/transgender raises INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.204032, 13.05202, array['aaaaaaaa-0000-0000-0000-000000000001/a.jpg'],
       p_gender => 'female') $$,
  'P0001', 'INVALID_INPUT', 'a report without a GCC street raises INVALID_INPUT'
);

-- Happy path
create temp table created (id uuid) on commit drop;
grant all on created to authenticated, service_role;
insert into created
select public.create_report('pothole', null, 'Deep pothole', 80.204032, 13.05202, array['aaaaaaaa-0000-0000-0000-000000000001/a.jpg'],
  p_reporter_name => 'Asha', p_reporter_phone => '9876543210',
  p_gender => 'female', p_gcc_street_id => '7553', p_gcc_road_name => 'Arunachalam Street',
  p_gcc_zone => '10', p_gcc_ward => '129', p_landmark => 'Near Kauvery Hospital');

select is(
  (select row(gcc_street_id, gcc_road_name, gcc_zone, gcc_ward, landmark, gcc_status::text)::text from public.reports where id = (select id from created)),
  row('7553', 'Arunachalam Street', '10', '129', 'Near Kauvery Hospital', 'pending')::text,
  'the report stores the GCC street, ward/zone and landmark, and starts as pending for GCC'
);

select throws_ok(
  $$ select * from public.gcc_submissions $$,
  '42501', null, 'gcc_submissions is not readable by app users'
);
select throws_ok(
  $$ select * from public.claim_gcc_submissions(5) $$,
  '42501', null, 'app users cannot claim submissions'
);
select throws_ok(
  $$ select public.record_gcc_result((select id from created), 'X', null) $$,
  '42501', null, 'app users cannot record GCC results'
);

reset role;

select is(
  (select row(status::text, gender, attempts)::text from public.gcc_submissions where report_id = (select id from created)),
  row('pending', 'female', 0)::text,
  'a pending submission records the gender, with no attempts yet'
);
select ok(
  (select next_attempt_at between now() + interval '119 minutes' and now() + interval '121 minutes'
   from public.gcc_submissions where report_id = (select id from created)),
  'the submission is held for the configured 2 hours before sending'
);
select is(
  (select value #>> '{}' from public.app_settings where key = 'gcc_hold'),
  '2 hours',
  'the hold window is a setting, defaulting to 2 hours'
);

-- Claiming
set local role service_role;
select is((select count(*)::int from public.claim_gcc_submissions(5)), 0, 'nothing is claimed during the hold');
reset role;

update public.gcc_submissions set next_attempt_at = now() - interval '1 minute' where report_id = (select id from created);

set local role service_role;
create temp table claimed on commit drop as select * from public.claim_gcc_submissions(5);
select is((select count(*)::int from claimed), 1, 'a due submission is claimed');
select is(
  (select row(category::text, note, gcc_street_id, gcc_road_name, gcc_zone, gcc_ward, landmark, reporter_name, gender, photo_path)::text from claimed),
  row('pothole', 'Deep pothole', '7553', 'Arunachalam Street', '10', '129', 'Near Kauvery Hospital', 'Asha', 'female',
      'aaaaaaaa-0000-0000-0000-000000000001/a.jpg')::text,
  'the claim returns everything the GCC payload needs, without the reporter phone'
);
select ok((select abs(lng - 80.204032) < 1e-6 and abs(lat - 13.05202) < 1e-6 from claimed), 'the claim returns the pin coordinates');
select is((select count(*)::int from public.claim_gcc_submissions(5)), 0, 'an in-flight submission is not claimed twice');
reset role;

select is(
  (select row(status::text, attempts)::text from public.gcc_submissions where report_id = (select id from created)),
  row('in_flight', 1)::text,
  'claiming marks the submission in flight and counts the attempt'
);

-- A stuck in-flight claim (forwarder crashed) is retried after 15 minutes
update public.gcc_submissions set claimed_at = now() - interval '16 minutes' where report_id = (select id from created);
set local role service_role;
select is((select count(*)::int from public.claim_gcc_submissions(5)), 1, 'a stale in-flight claim is reclaimed');

-- Failure → backoff
select lives_ok($$ select public.record_gcc_result((select id from created), null, 'HTTP 502') $$, 'service role records a failure');
reset role;
select is(
  (select row(status::text, last_error)::text from public.gcc_submissions where report_id = (select id from created)),
  row('pending', 'HTTP 502')::text,
  'a failure goes back to pending with the error kept'
);
select ok(
  (select next_attempt_at > now() + interval '20 minutes' from public.gcc_submissions where report_id = (select id from created)),
  'the retry is backed off (2nd attempt failed → 30 minutes)'
);

-- Success
set local role service_role;
select lives_ok($$ select public.record_gcc_result((select id from created), '2026-48213', null) $$, 'service role records a success');
reset role;
select is(
  (select row(gcc_status::text, gcc_complaint_number)::text from public.reports where id = (select id from created)),
  row('submitted', '2026-48213')::text,
  'success puts the GCC complaint number on the public report'
);
select is(
  (select status::text from public.gcc_submissions where report_id = (select id from created)),
  'submitted',
  'the submission is marked submitted'
);

-- Final failure after 5 attempts
insert into public.reports (id, category, location)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'waterlogging', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography);
insert into public.gcc_submissions (report_id, gender, status, attempts, next_attempt_at, claimed_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'male', 'in_flight', 5, now(), now());
set local role service_role;
select public.record_gcc_result('bbbbbbbb-0000-0000-0000-000000000001', null, 'timeout');
reset role;
select is(
  (select row(s.status::text, r.gcc_status::text)::text from public.gcc_submissions s join public.reports r on r.id = s.report_id
   where s.report_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  row('failed', 'failed')::text,
  'the 5th failed attempt marks the submission (and report) failed'
);

-- Hidden, fixed and blocked reports are never claimed
insert into public.reports (id, category, location, is_hidden)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, true);
insert into public.reports (id, category, location, status)
values ('bbbbbbbb-0000-0000-0000-000000000003', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, 'fixed');
insert into public.reports (id, category, location)
values ('bbbbbbbb-0000-0000-0000-000000000004', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography);
insert into public.gcc_submissions (report_id, gender, status, next_attempt_at) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'male', 'pending', now() - interval '1 minute'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'male', 'pending', now() - interval '1 minute'),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'male', 'blocked', now() - interval '1 minute');
set local role service_role;
select is((select count(*)::int from public.claim_gcc_submissions(5)), 0, 'hidden, fixed and blocked reports are not claimed');
reset role;

-- The public map data carries the GCC status and number
select has_column('public', 'reports', 'gcc_complaint_number', 'reports has a public gcc_complaint_number');
select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'gcc_status'),
  'reports has a public gcc_status'
);

-- Scheduling
select lives_ok($$ select public.trigger_gcc_forward() $$, 'the scheduled trigger is a no-op when the forward URL/secret are not configured');
select is(
  (select count(*)::int from cron.job where jobname = 'gcc-forward' and schedule = '*/5 * * * *'),
  1,
  'the GCC forwarder is scheduled every 5 minutes'
);

select * from finish();
rollback;

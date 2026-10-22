create extension if not exists pgtap with schema extensions;

begin;
select plan(30);

-- Users: the allowlisted admin, a signed-in non-admin, an anonymous user, and an
-- allowlisted email that has not confirmed it.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous) values
  ('ad000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'iamjayendran@gmail.com', now(), '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('ad000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone@example.com', now(), '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('ad000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '', now(), now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true),
  ('ad000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending-admin@example.com', null, '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('ad000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, null, '', now(), now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);
insert into public.admin_users (email) values ('pending-admin@example.com');

-- Reports by one anonymous reporter (…0009): two pending, one filed, one failed.
insert into public.reports (id, category, note, location, gcc_street_id, gcc_road_name, gcc_ward, gcc_zone, gcc_status, gcc_complaint_number, created_at) values
  ('c0000000-0000-0000-0000-000000000001', 'pothole', 'Deep pothole', extensions.st_setsrid(extensions.st_makepoint(80.204, 13.052), 4326)::extensions.geography, '7553', 'Arunachalam Street', '129', '10', 'pending', null, now() - interval '4 minutes'),
  ('c0000000-0000-0000-0000-000000000002', 'waterlogging', null, extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '11', 'Anna Salai', '064', '05', 'pending', null, now() - interval '3 minutes'),
  ('c0000000-0000-0000-0000-000000000003', 'pothole', null, extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '12', 'Mount Road', '064', '05', 'submitted', '2026-48213', now() - interval '2 minutes'),
  ('c0000000-0000-0000-0000-000000000004', 'pothole', null, extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '13', 'Mint Street', '055', '05', 'failed', null, now() - interval '1 minute');
insert into public.report_owners (report_id, reporter_id)
select id, 'ad000000-0000-0000-0000-000000000009' from public.reports where id::text like 'c0000000-%';
insert into public.report_contacts (report_id, name, phone) values ('c0000000-0000-0000-0000-000000000001', 'Ravi K', '9876543212');
insert into public.report_photos (report_id, storage_path, kind, uploaded_by) values
  ('c0000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000009/p1.jpg', 'report', 'ad000000-0000-0000-0000-000000000009');
insert into public.gcc_submissions (report_id, gender, status, attempts, next_attempt_at, complaint_number, last_error) values
  ('c0000000-0000-0000-0000-000000000001', 'male', 'pending', 0, now() + interval '2 hours', null, null),
  ('c0000000-0000-0000-0000-000000000002', 'female', 'pending', 0, now() + interval '2 hours', null, null),
  ('c0000000-0000-0000-0000-000000000003', 'male', 'submitted', 1, now(), '2026-48213', null),
  ('c0000000-0000-0000-0000-000000000004', 'male', 'failed', 5, now(), null, 'GCC responded HTTP 502');

set local role authenticated;

-- Access control
set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}';
select is(public.is_admin(), false, 'an anonymous user is not an admin');
select throws_ok($$ select * from public.admin_list_reports() $$, 'P0001', 'AUTH_REQUIRED', 'anonymous users cannot list reports');

set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}';
select is(public.is_admin(), false, 'a signed-in user who is not on the admin list is not an admin');
select throws_ok($$ select * from public.admin_list_reports() $$, 'P0001', 'AUTH_REQUIRED', 'non-admins cannot list reports');
select throws_ok($$ select * from public.admin_flag_reports(array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'AUTH_REQUIRED', 'non-admins cannot flag');
select throws_ok($$ select public.admin_unflag_reports(array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'AUTH_REQUIRED', 'non-admins cannot unflag');
select throws_ok($$ select public.admin_retry_gcc('c0000000-0000-0000-0000-000000000004') $$, 'P0001', 'AUTH_REQUIRED', 'non-admins cannot retry');
select throws_ok($$ select * from public.admin_reporter_reports('c0000000-0000-0000-0000-000000000001') $$, 'P0001', 'AUTH_REQUIRED', 'non-admins cannot see a reporter''s history');

set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":false}';
select is(public.is_admin(), false, 'an allowlisted email that is not confirmed is not an admin');

set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
select is(public.is_admin(), true, 'the confirmed, allowlisted admin is an admin');

select throws_ok($$ select * from public.admin_users $$, '42501', null, 'the admin list itself is not readable');

-- Listing
select is(
  (select array_agg(id::text order by created_at desc) from public.admin_list_reports('pending')),
  array['c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'],
  'the pending filter lists reports waiting to be sent, newest first'
);
select is(
  (select row(reporter_name, reporter_phone, gender, gcc_road_name, gcc_ward, reporter_report_count, photo_paths[1], next_attempt_at is not null)::text
   from public.admin_list_reports('pending') where id = 'c0000000-0000-0000-0000-000000000001'),
  row('Ravi K', '9876543212', 'male', 'Arunachalam Street', '129', 4, 'ad000000-0000-0000-0000-000000000009/p1.jpg', true)::text,
  'each row has the reporter''s name, phone, gender, GCC street/ward, report count, photos and send time'
);
select is((select count(*)::int from public.admin_list_reports('filed')), 1, 'the filed filter lists reports filed with GCC');
select is(
  (select row(complaint_number, last_error)::text from public.admin_list_reports('failed')),
  row(null::text, 'GCC responded HTTP 502')::text,
  'the failed filter shows the last GCC error'
);
select is((select count(*)::int from public.admin_list_reports('all')), 4, 'all lists every report');
select is((select count(*)::int from public.admin_list_reports('all', 'ravi')), 1, 'search matches the reporter name');
select is((select count(*)::int from public.admin_list_reports('all', null, '064')), 2, 'the ward filter narrows to one ward');
select is(
  (select count(*)::int from public.admin_reporter_reports('c0000000-0000-0000-0000-000000000001')),
  3,
  'a reporter''s other reports are listed (keyed by report, not by user id)'
);

-- Flag: one click hides from the map and blocks the GCC send
select is(
  (select row(report_id::text, already_filed)::text from public.admin_flag_reports(array['c0000000-0000-0000-0000-000000000001']::uuid[])),
  row('c0000000-0000-0000-0000-000000000001', false)::text,
  'flagging a pending report succeeds'
);
reset role;
select is(
  (select row(r.is_hidden, s.status::text, r.gcc_status::text, s.blocked_by::text)::text
   from public.reports r join public.gcc_submissions s on s.report_id = r.id where r.id = 'c0000000-0000-0000-0000-000000000001'),
  row(true, 'blocked', 'blocked', 'ad000000-0000-0000-0000-000000000001')::text,
  'a flagged report is hidden from the map and its GCC send is blocked, recording who flagged it'
);
update public.gcc_submissions set next_attempt_at = now() - interval '1 minute' where report_id = 'c0000000-0000-0000-0000-000000000001';
set local role service_role;
select is(
  (select count(*)::int from public.claim_gcc_submissions(5) where report_id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'the forwarder never sends a flagged report'
);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';

select lives_ok($$ select public.admin_set_flag_reason('c0000000-0000-0000-0000-000000000001', 'spam') $$, 'the admin can add a reason after flagging');
select throws_ok($$ select public.admin_set_flag_reason('c0000000-0000-0000-0000-000000000001', 'because') $$, 'P0001', 'INVALID_INPUT', 'only known reasons are accepted');
select is(
  (select blocked_reason from public.admin_list_reports('flagged') where id = 'c0000000-0000-0000-0000-000000000001'),
  'spam',
  'the flagged filter shows the reason'
);

-- Flagging a report already filed with GCC still hides it, and says so
select is(
  (select row(already_filed, complaint_number)::text from public.admin_flag_reports(array['c0000000-0000-0000-0000-000000000003']::uuid[])),
  row(true, '2026-48213')::text,
  'flagging an already-filed report hides it and reports the GCC complaint number'
);

-- Undo: back on the map and back in the queue, but never sent instantly
select lives_ok(
  $$ select public.admin_unflag_reports(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'the admin can undo flags in bulk'
);
reset role;
select is(
  (select row(r.is_hidden, s.status::text, r.gcc_status::text, s.next_attempt_at >= now() + interval '9 minutes')::text
   from public.reports r join public.gcc_submissions s on s.report_id = r.id where r.id = 'c0000000-0000-0000-0000-000000000001'),
  row(false, 'pending', 'pending', true)::text,
  'undo un-hides the report and re-queues it no sooner than 10 minutes from now'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';

-- Retry a failed send
select lives_ok($$ select public.admin_retry_gcc('c0000000-0000-0000-0000-000000000004') $$, 'the admin can retry a failed send');
reset role;
select is(
  (select row(s.status::text, s.attempts, r.gcc_status::text, s.next_attempt_at <= now())::text
   from public.reports r join public.gcc_submissions s on s.report_id = r.id where r.id = 'c0000000-0000-0000-0000-000000000004'),
  row('pending', 0, 'pending', true)::text,
  'retry re-queues the failed report for the next run with a fresh attempt count'
);

select * from finish();
rollback;

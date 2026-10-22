create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

-- Fixtures: the admin, a signed-in non-admin, and two open reports A and B.
-- No email on the fixture users: is_admin() reads only the JWT, and the real admin
-- account may already exist locally (auth.users.email is unique).
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now());
insert into public.reports (id, category, location) values
  ('a0000000-0000-0000-0000-00000000000a', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography),
  ('b0000000-0000-0000-0000-00000000000b', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.28, 13.07), 4326)::extensions.geography);

set local role authenticated;

-- Non-admin is refused.
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false,"email":"someone@else.com","amr":[{"method":"otp","timestamp":1}]}';
select throws_ok(
  $$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', '2026-736JEJ') $$,
  'P0001', 'AUTH_REQUIRED', 'a non-admin cannot save a filing'
);

-- Admin saves A with a messy ID.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com","amr":[{"method":"otp","timestamp":1}]}';
select lives_ok(
  $$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', ' 2026-736jej ') $$,
  'the admin can save a filing'
);

reset role;
select is((select complaint_id from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a'), '2026-736JEJ', 'the complaint ID is trimmed and uppercased');
select is((select status::text from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a'), 'registered', 'status defaults to registered');
select is((select filed_by from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a'), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'filed_by is the admin');
select is((select count(*)::int from public.gcc_filing_events where report_id = 'a0000000-0000-0000-0000-00000000000a'), 1, 'the first save writes one history row');

create temp table first_save as
  select filed_at, filed_by from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a';
grant select on first_save to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com","amr":[{"method":"otp","timestamp":1}]}';

-- Validation.
select throws_ok($$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', '   ') $$, 'P0001', 'INVALID_INPUT', 'a blank complaint ID is rejected');
select throws_ok($$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', repeat('X', 41)) $$, 'P0001', 'INVALID_INPUT', 'a 41-character complaint ID is rejected');
select throws_ok($$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', '2026-736JEJ', 'registered', repeat('n', 1001)) $$, 'P0001', 'INVALID_INPUT', 'a 1001-character note is rejected');
select throws_ok($$ select * from public.admin_save_gcc_filing('99999999-9999-9999-9999-999999999999', '2026-736JEJ') $$, 'P0001', 'INVALID_INPUT', 'an unknown report is rejected');

-- Re-save A with a new status: first-filed fields stay, history grows.
select lives_ok(
  $$ select * from public.admin_save_gcc_filing('a0000000-0000-0000-0000-00000000000a', '2026-736JEJ', 'processing', 'ward 112') $$,
  'the admin can update the status'
);

reset role;
select is((select status::text from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a'), 'processing', 'status is updated');
select is((select note from public.gcc_filings where report_id = 'a0000000-0000-0000-0000-00000000000a'), 'ward 112', 'note is updated');
select ok(
  (select g.filed_at = f.filed_at and g.filed_by = f.filed_by
     from public.gcc_filings g, first_save f
    where g.report_id = 'a0000000-0000-0000-0000-00000000000a'),
  'filed_at and filed_by are kept on re-save'
);
select is((select count(*)::int from public.gcc_filing_events where report_id = 'a0000000-0000-0000-0000-00000000000a'), 2, 'the re-save appends a history row');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com","amr":[{"method":"otp","timestamp":1}]}';

-- B shares A's complaint ID.
select is(
  (select duplicate_of from public.admin_save_gcc_filing('b0000000-0000-0000-0000-00000000000b', '2026-736JEJ')),
  array['a0000000-0000-0000-0000-00000000000a'::uuid],
  'saving an ID already on another report returns that report as a duplicate'
);

-- Private tables are unreachable directly, even for the admin's session.
select throws_ok($$ select * from public.gcc_filings $$, '42501', null, 'gcc_filings is not readable directly');
select throws_ok($$ select * from public.gcc_filing_events $$, '42501', null, 'gcc_filing_events is not readable directly');

select * from finish();
rollback;

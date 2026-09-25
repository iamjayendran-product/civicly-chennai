create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- AUTH_REQUIRED: no session
select throws_ok(
  $$ select public.confirm_same_issue('00000000-0000-0000-0000-000000000000') $$,
  'P0001',
  'AUTH_REQUIRED',
  'calling with no JWT sub claim raises AUTH_REQUIRED'
);

-- Fixture: an existing open report from a different (anonymous) reporter.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into public.reports (id, category, location)
values (
  '33333333-3333-3333-3333-333333333333',
  'pothole',
  extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography
);
insert into public.report_owners (report_id, reporter_id)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');

-- A second, different (anonymous) user confirms it's the same issue — no Google
-- sign-in required, matching create_report's own AUTH_REQUIRED-only bar.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","is_anonymous":true}';

select lives_ok(
  $$ select public.confirm_same_issue('33333333-3333-3333-3333-333333333333') $$,
  'an anonymous session can confirm an existing report is the same issue'
);
select is(
  (select upvote_count from public.reports where id = '33333333-3333-3333-3333-333333333333'),
  1,
  'confirming increments upvote_count by 1'
);

-- INVALID_INPUT: report does not exist
select throws_ok(
  $$ select public.confirm_same_issue('99999999-9999-9999-9999-999999999999') $$,
  'P0001',
  'INVALID_INPUT',
  'confirming a non-existent report raises INVALID_INPUT'
);

-- RATE_LIMITED: this is the 21st confirm this hour for this user (20 already logged).
-- rate_events has no insert policy for anon/authenticated (only security definer RPCs
-- write it), so this fixture insert needs the superuser role, like report_owners
-- fixtures elsewhere in this test suite.
reset role;
insert into public.rate_events (user_id, action, created_at)
select '44444444-4444-4444-4444-444444444444', 'confirm', now() from generate_series(1, 20);
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","is_anonymous":true}';
select throws_ok(
  $$ select public.confirm_same_issue('33333333-3333-3333-3333-333333333333') $$,
  'P0001',
  'RATE_LIMITED',
  'more than 20 confirms in an hour raises RATE_LIMITED'
);

-- Default-deny: confirm_same_issue is the only way to move upvote_count. reports has
-- no UPDATE policy for anon/authenticated, so — unlike INSERT's WITH CHECK, which
-- raises a real 42501 — RLS's USING clause just filters the row out of the UPDATE's
-- view silently (0 rows affected, no error). Verify that silent-no-op behavior by
-- checking the value is still untouched, rather than expecting a thrown exception.
set local role anon;
select lives_ok(
  $$ update public.reports set upvote_count = 99 where id = '33333333-3333-3333-3333-333333333333' $$,
  'anon updating reports directly is a silent no-op (RLS filters the row, no policy grants access)'
);
reset role;
select is(
  (select upvote_count from public.reports where id = '33333333-3333-3333-3333-333333333333'),
  1,
  'the direct anon update above did not actually change upvote_count'
);

select * from finish();
rollback;

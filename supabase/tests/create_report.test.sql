create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- Helper: a point well inside the CMDA boundary (central Chennai).
-- lng=80.27, lat=13.06

-- Fixture user
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', now(), now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":true}';

-- Happy path
select lives_ok(
  $$ select public.create_report('pothole', null, 'Deep pothole near bus stop', 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/a.jpg']) $$,
  'create_report succeeds for a valid pothole report inside the CMDA'
);
select is(
  (select count(*)::int from public.reports where reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report row was inserted'
);
select is(
  (select count(*)::int from public.report_photos rp join public.reports r on r.id = rp.report_id where r.reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report_photos row was inserted'
);
-- rate_events has no select policy for anon/authenticated by design (Task 1: it is
-- only ever written/read via security-definer RPCs). Drop to postgres to verify the
-- RPC's own write landed, then restore the simulated session for the remaining tests.
reset role;
select is(
  (select count(*)::int from public.rate_events where user_id = '11111111-1111-1111-1111-111111111111' and action = 'report'),
  1,
  'a rate_events row was logged'
);
set local role authenticated;

-- OUTSIDE_CMDA: a point far outside Chennai (Mumbai)
select throws_ok(
  $$ select public.create_report('pothole', null, null, 72.8777, 19.0760, array['11111111-1111-1111-1111-111111111111/b.jpg']) $$,
  'P0001',
  'OUTSIDE_CMDA',
  'a point outside the CMDA raises OUTSIDE_CMDA'
);

-- INVALID_INPUT: category=other without subtype
select throws_ok(
  $$ select public.create_report('other', null, null, 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/c.jpg']) $$,
  'P0001',
  'INVALID_INPUT',
  'category=other without a subtype raises INVALID_INPUT'
);

-- INVALID_PHOTOS: zero photos
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array[]::text[]) $$,
  'P0001',
  'INVALID_PHOTOS',
  'zero photos raises INVALID_PHOTOS'
);

-- INVALID_PHOTOS: a path not owned by the caller
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['22222222-2222-2222-2222-222222222222/d.jpg']) $$,
  'P0001',
  'INVALID_PHOTOS',
  'a photo path not owned by the caller raises INVALID_PHOTOS'
);

-- RATE_LIMITED: six reports within an hour breaches the 5/hour cap
-- (rate_events has no insert policy for anon/authenticated either; same reasoning as above.)
reset role;
insert into public.rate_events (user_id, action, created_at)
select '11111111-1111-1111-1111-111111111111', 'report', now() - (n || ' minutes')::interval
from generate_series(1, 5) as n;
set local role authenticated;
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/e.jpg']) $$,
  'P0001',
  'RATE_LIMITED',
  'a 6th report within an hour raises RATE_LIMITED'
);

select * from finish();
rollback;

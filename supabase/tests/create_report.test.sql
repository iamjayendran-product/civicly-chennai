create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- Helper: a point well inside the CMDA boundary (central Chennai).
-- lng=80.27, lat=13.06

-- AUTH_REQUIRED: no session (no request.jwt.claims set yet)
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['00000000-0000-0000-0000-000000000000/a.jpg']) $$,
  'P0001',
  'AUTH_REQUIRED',
  'calling with no JWT sub claim raises AUTH_REQUIRED'
);

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
-- Neither rate_events nor report_owners is readable by anon/authenticated by design
-- (they are only ever written/read via security-definer RPCs; report_owners keeps
-- reporter identity off public.reports and out of the Realtime broadcast). Drop to
-- postgres to verify the RPC's own writes landed, then restore the simulated session
-- for the remaining tests.
reset role;
select is(
  (select count(*)::int from public.report_owners where reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report_owners row records the reporter'
);
select is(
  (select count(*)::int from public.reports r join public.report_owners o on o.report_id = r.id
    where o.reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report row was inserted'
);
select is(
  (select count(*)::int from public.report_photos rp join public.report_owners o on o.report_id = rp.report_id where o.reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report_photos row was inserted'
);
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

-- RATE_LIMITED via the per-IP-hash path (30/day), proven with a fresh user so the
-- per-user rate limits (already tripped above) don't interfere.
-- Drop to postgres: auth.users has no insert policy for authenticated, and
-- vault.decrypted_secrets isn't readable by authenticated either.
reset role;
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

insert into public.rate_events (user_id, ip_hash, action, created_at)
select
  '77777777-7777-7777-7777-777777777777',  -- unrelated throwaway id, not the caller
  encode(extensions.digest('203.0.113.5' || (select decrypted_secret from vault.decrypted_secrets where name = 'road_grievance_ip_salt'), 'sha256'), 'hex'),
  'report',
  now() - (n || ' minutes')::interval
from generate_series(1, 30) as n;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","is_anonymous":true}';
-- Multi-hop x-forwarded-for: each proxy appends the peer it saw, so only the RIGHTMOST
-- entry is trustworthy. The two entries on the left are the kind of forgery a client can
-- send to mint itself a fresh rate-limit bucket; with the old leftmost-entry logic this
-- call would hash "1.2.3.4" and sail past the cap.
set local request.headers = '{"x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.5"}';
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['66666666-6666-6666-6666-666666666666/g.jpg']) $$,
  'P0001',
  'RATE_LIMITED',
  'a 31st report from the same rightmost x-forwarded-for hash within a day raises RATE_LIMITED, independent of per-user limits'
);

-- Converse: the rate-limited address appearing as a forged LEFTMOST entry must not
-- limit a request whose real (rightmost) address is unseen.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated","is_anonymous":true}';
set local request.headers = '{"x-forwarded-for": "203.0.113.5, 198.51.100.9"}';
select lives_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['88888888-8888-8888-8888-888888888888/h.jpg']) $$,
  'only the rightmost x-forwarded-for entry counts: a spoofed leftmost entry does not carry another IP''s rate-limit bucket'
);

select * from finish();
rollback;

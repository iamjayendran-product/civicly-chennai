create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- Tables exist
select has_table('public', 'cmda_boundary', 'cmda_boundary table exists');
select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'report_photos', 'report_photos table exists');
select has_table('public', 'rate_events', 'rate_events table exists');

-- RLS is enabled on every domain table
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reports'::regclass),
  'RLS is enabled on reports'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.report_photos'::regclass),
  'RLS is enabled on report_photos'
);

-- The category/subtype pairing check constraint exists and is enforced
select throws_ok(
  $$ insert into public.reports (category, subtype, location, reporter_id)
     values ('pothole', 'debris', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '23514',
  null,
  'a non-other category with a subtype violates the check constraint'
);
select throws_ok(
  $$ insert into public.reports (category, location, reporter_id)
     values ('other', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '23514',
  null,
  'category=other without a subtype violates the check constraint'
);

-- Generated lng/lat columns reflect the point.
-- reports.reporter_id has a NOT NULL FK to auth.users(id): unlike the CHECK-constraint
-- and RLS tests above (which fail before any FK trigger fires), this insert has no
-- constraint violation of its own, so it needs a real auth.users row or it would fail
-- with a foreign-key violation (23503) instead of testing what we want here.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '99999999-9999-9999-9999-999999999999');
select ok(
  (select abs(lng - 80.27) < 0.0001 and abs(lat - 13.06) < 0.0001 from public.reports order by created_at desc limit 1),
  'generated lng/lat columns match the inserted point'
);

-- No direct write access for anon or authenticated (RLS denies; no insert/update/delete policy exists)
set local role anon;
select throws_ok(
  $$ insert into public.reports (category, location, reporter_id)
     values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '42501',
  null,
  'anon cannot insert directly into reports'
);
reset role;

-- reports is published for Realtime
select ok(
  exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'),
  'reports table is in the supabase_realtime publication'
);

select * from finish();
rollback;

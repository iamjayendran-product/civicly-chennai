create extension if not exists pgtap with schema extensions;

begin;
select plan(22);

-- Tables exist
select has_table('public', 'cmda_boundary', 'cmda_boundary table exists');
select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'report_photos', 'report_photos table exists');
select has_table('public', 'rate_events', 'rate_events table exists');
select has_table('public', 'report_owners', 'report_owners table exists');

-- RLS is enabled on every domain table
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reports'::regclass),
  'RLS is enabled on reports'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.report_photos'::regclass),
  'RLS is enabled on report_photos'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.report_owners'::regclass),
  'RLS is enabled on report_owners'
);

-- The category/subtype pairing check constraint exists and is enforced
select throws_ok(
  $$ insert into public.reports (category, subtype, location)
     values ('pothole', 'debris', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography) $$,
  '23514',
  null,
  'a non-other category with a subtype violates the check constraint'
);
select throws_ok(
  $$ insert into public.reports (category, location)
     values ('other', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography) $$,
  '23514',
  null,
  'category=other without a subtype violates the check constraint'
);

-- Generated lng/lat columns reflect the point.
insert into public.reports (category, location)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography);
select ok(
  (select abs(lng - 80.27) < 0.0001 and abs(lat - 13.06) < 0.0001 from public.reports order by created_at desc limit 1),
  'generated lng/lat columns match the inserted point'
);

-- No direct write access for anon or authenticated (RLS denies; no insert/update/delete policy exists)
set local role anon;
select throws_ok(
  $$ insert into public.reports (category, location)
     values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography) $$,
  '42501',
  null,
  'anon cannot insert directly into reports'
);
reset role;

-- Reporter identity is not on public.reports at all. The column being gone is what
-- closes the Realtime `postgres_changes` broadcast leak: the WAL row that Realtime
-- ships to every subscribed anonymous client can only contain columns that exist.
select hasnt_column('public', 'reports', 'reporter_id', 'reports has no reporter_id column');
set local role anon;
select throws_ok(
  $$ select reporter_id from public.reports $$,
  '42703',
  null,
  'anon selecting reports.reporter_id fails: the column does not exist'
);
reset role;

-- report_owners holds the identity instead, and is unreachable from the Data API
-- (no grants, plus RLS with no policies) — only security definer RPCs may read it.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());
insert into public.report_owners (report_id, reporter_id)
select id, '99999999-9999-9999-9999-999999999999' from public.reports order by created_at desc limit 1;

set local role anon;
select throws_ok(
  $$ select * from public.report_owners $$,
  '42501',
  null,
  'anon cannot select from report_owners'
);
reset role;
set local role authenticated;
select throws_ok(
  $$ select * from public.report_owners $$,
  '42501',
  null,
  'authenticated cannot select from report_owners'
);
reset role;

-- Column-level grants keep reporter identity and storage paths off report_photos too
-- (report_photos is not in the realtime publication, so grants fully close it).
select ok(
  not has_column_privilege('anon', 'public.report_photos', 'uploaded_by', 'select'),
  'anon cannot select report_photos.uploaded_by'
);
select ok(
  not has_column_privilege('anon', 'public.report_photos', 'storage_path', 'select'),
  'anon cannot select report_photos.storage_path'
);
select ok(
  has_column_privilege('anon', 'public.report_photos', 'kind', 'select'),
  'anon can still select the public report_photos columns'
);

-- reports itself is column-granted as defence in depth: the geography column is not
-- exposed, the map-facing columns are.
select ok(
  not has_column_privilege('anon', 'public.reports', 'location', 'select'),
  'anon cannot select reports.location'
);
select ok(
  has_column_privilege('anon', 'public.reports', 'lng', 'select')
    and has_column_privilege('anon', 'public.reports', 'status', 'select')
    and has_column_privilege('anon', 'public.reports', 'is_hidden', 'select'),
  'anon can still select the map-facing reports columns'
);

-- reports is published for Realtime
select ok(
  exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'),
  'reports table is in the supabase_realtime publication'
);

select * from finish();
rollback;

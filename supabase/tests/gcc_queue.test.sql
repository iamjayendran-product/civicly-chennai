create extension if not exists pgtap with schema extensions;

begin;
select plan(17);

-- Start from an empty reports table (rolled back at the end) so local demo data
-- can't change counts or ordering.
delete from public.reports;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'iamjayendran@gmail.com', false, now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone@else.com', false, now(), now());

-- U1, U2 (no contact row), U3 (newest, with photos): open, unfiled.
-- F1, F2: open, filed. H: hidden unfiled. X: fixed unfiled. FX: filed, then fixed.
insert into public.reports (id, category, note, location, created_at, upvote_count, is_hidden, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'pothole', 'U1', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now() - interval '2 days', 3, false, 'open'),
  ('00000000-0000-0000-0000-0000000000a2', 'pothole', 'U2', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now() - interval '3 days', 0, false, 'open'),
  ('00000000-0000-0000-0000-0000000000a3', 'waterlogging', 'U3', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now() - interval '1 day', 14, false, 'open'),
  ('00000000-0000-0000-0000-0000000000f1', 'pothole', 'F1', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now() - interval '5 days', 0, false, 'open'),
  ('00000000-0000-0000-0000-0000000000f2', 'pothole', 'F2', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now() - interval '6 days', 0, false, 'open'),
  ('00000000-0000-0000-0000-0000000000b1', 'pothole', 'H',  extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now(), 0, true,  'open'),
  ('00000000-0000-0000-0000-0000000000b2', 'pothole', 'X',  extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now(), 0, false, 'fixed'),
  ('00000000-0000-0000-0000-0000000000b3', 'pothole', 'FX', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, now(), 0, false, 'fixed');

insert into public.report_contacts (report_id, name, phone) values
  ('00000000-0000-0000-0000-0000000000a1', 'Priya', '9876543210'),
  ('00000000-0000-0000-0000-0000000000a3', 'Arun', '9123456780');

insert into public.report_photos (report_id, storage_path, kind, uploaded_by, created_at) values
  ('00000000-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-000000000002/one.jpg', 'report', 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-000000000002/two.jpg', 'report', 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-000000000002/fix.jpg', 'fix',    'bbbbbbbb-0000-0000-0000-000000000002', now());

insert into public.gcc_filings (report_id, complaint_id, status, filed_at, filed_by, updated_at, updated_by) values
  ('00000000-0000-0000-0000-0000000000f1', '2026-111AAA', 'registered', now() - interval '4 days', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '4 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-222BBB', 'processing', now() - interval '5 days', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 hour', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000b3', '2026-333CCC', 'completed',  now() - interval '2 days', 'aaaaaaaa-0000-0000-0000-000000000001', now(), 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.gcc_filing_events (report_id, complaint_id, status, actor, created_at) values
  ('00000000-0000-0000-0000-0000000000f2', '2026-222BBB', 'registered', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-222BBB', 'processing', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 hour');

set local role authenticated;

-- Non-admins are refused everywhere.
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false,"email":"someone@else.com"}';
select throws_ok($$ select * from public.admin_gcc_queue('unfiled') $$, 'P0001', 'AUTH_REQUIRED', 'a non-admin cannot read the queue');
select throws_ok($$ select * from public.admin_gcc_counts() $$, 'P0001', 'AUTH_REQUIRED', 'a non-admin cannot read the counts');
select throws_ok($$ select * from public.admin_gcc_history('00000000-0000-0000-0000-0000000000f2') $$, 'P0001', 'AUTH_REQUIRED', 'a non-admin cannot read history');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com"}';

select throws_ok($$ select * from public.admin_gcc_queue('bogus') $$, 'P0001', 'INVALID_INPUT', 'an unknown tab is rejected');

-- Unfiled tab.
select is(
  (select array_agg(id order by sort_key desc) from public.admin_gcc_queue('unfiled')),
  array['00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[],
  'unfiled holds open, visible, unfiled reports, newest first'
);
select is(
  (select array_agg(id) from public.admin_gcc_queue('unfiled')),
  array['00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[],
  'rows are returned in sort order'
);
select is(
  (select reporter_name from public.admin_gcc_queue('unfiled') where id = '00000000-0000-0000-0000-0000000000a2'),
  null,
  'a report without a contact row still appears, with a null name'
);
select is(
  (select reporter_phone from public.admin_gcc_queue('unfiled') where id = '00000000-0000-0000-0000-0000000000a1'),
  '9876543210',
  'the reporter phone is included'
);
select is(
  (select photo_paths from public.admin_gcc_queue('unfiled') where id = '00000000-0000-0000-0000-0000000000a3'),
  array['bbbbbbbb-0000-0000-0000-000000000002/one.jpg', 'bbbbbbbb-0000-0000-0000-000000000002/two.jpg'],
  'photo_paths lists only report photos, oldest first'
);
select is(
  (select upvote_count from public.admin_gcc_queue('unfiled') where id = '00000000-0000-0000-0000-0000000000a3'),
  14,
  'the +1 count is included'
);

-- Filed tab.
select is(
  (select array_agg(id) from public.admin_gcc_queue('filed')),
  array['00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1']::uuid[],
  'filed holds open, visible, filed reports by last update; a fixed one has left'
);
select is(
  (select complaint_id from public.admin_gcc_queue('filed') where id = '00000000-0000-0000-0000-0000000000f2'),
  '2026-222BBB',
  'filed rows carry the complaint ID'
);
select is(
  (select array_agg(id) from public.admin_gcc_queue('filed', 'processing')),
  array['00000000-0000-0000-0000-0000000000f2']::uuid[],
  'the status filter narrows the filed tab'
);

-- Keyset pagination.
select is(
  (select array_agg(id) from public.admin_gcc_queue('filed', null, 1)),
  array['00000000-0000-0000-0000-0000000000f2']::uuid[],
  'p_limit caps the page'
);
select is(
  (select array_agg(id) from public.admin_gcc_queue('filed', null, 1,
     (select sort_key from public.admin_gcc_queue('filed', null, 1)))),
  array['00000000-0000-0000-0000-0000000000f1']::uuid[],
  'p_before returns the next page'
);

-- Counts and history.
select is(
  (select row(unfiled, filed)::text from public.admin_gcc_counts()),
  '(3,2)',
  'counts match the two tabs'
);
select is(
  (select array_agg(status::text) from public.admin_gcc_history('00000000-0000-0000-0000-0000000000f2')),
  array['registered', 'processing'],
  'history is oldest first'
);

select * from finish();
rollback;

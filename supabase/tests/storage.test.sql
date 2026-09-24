create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

select is(
  (select public from storage.buckets where id = 'report-photos'),
  true,
  'report-photos bucket exists and is public-read'
);

select is(
  (select file_size_limit from storage.buckets where id = 'report-photos')::bigint,
  2097152::bigint,
  'report-photos bucket enforces a 2MB size limit'
);

-- Only the insert policy remains: the old "select" policy let anon/authenticated
-- list/enumerate every object in the bucket via Storage's authenticated API, which
-- leaks every reporter's uid (object paths are `{reporter_uid}/{filename}.jpg`).
-- Public read still works for anyone who already knows a path, via Storage's
-- dedicated public-object route, which bypasses RLS by design (see the accompanying
-- migration and live-HTTP verification notes).
select policies_are(
  'storage',
  'objects',
  ARRAY['report_photos_insert_own_path']
);

-- Seed one object as service_role (bypasses RLS), simulating a real upload.
insert into storage.objects (bucket_id, name, owner)
values ('report-photos', '11111111-1111-1111-1111-111111111111/test.jpg', '11111111-1111-1111-1111-111111111111');

set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'report-photos'),
  0,
  'anon cannot select/enumerate report-photos objects at all (no select policy)'
);
reset role;

set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'report-photos'),
  0,
  'authenticated cannot select/enumerate report-photos objects at all (no select policy)'
);
reset role;

select * from finish();
rollback;

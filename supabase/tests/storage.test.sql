create extension if not exists pgtap with schema extensions;

begin;
select plan(3);

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

select policies_are(
  'storage',
  'objects',
  ARRAY['report_photos_insert_own_path', 'report_photos_public_select']
);

select * from finish();
rollback;

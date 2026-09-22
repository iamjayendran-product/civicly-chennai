insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "report_photos_insert_own_path"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "report_photos_public_select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'report-photos');

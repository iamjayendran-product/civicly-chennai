create or replace function public.reports_in_bbox(
  p_min_lng float8,
  p_min_lat float8,
  p_max_lng float8,
  p_max_lat float8,
  p_include_fixed boolean default false
)
returns table (
  id uuid,
  category public.report_category,
  subtype public.report_subtype,
  note text,
  lng float8,
  lat float8,
  status public.report_status,
  upvote_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.subtype, r.note, r.lng, r.lat, r.status, r.upvote_count, r.created_at
  from public.reports r
  where r.is_hidden = false
    and (p_include_fixed or r.status = 'open')
    and extensions.st_intersects(
      r.location,
      extensions.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::extensions.geography
    )
  order by r.created_at desc
  limit 2000;
$$;

revoke execute on function public.reports_in_bbox(float8, float8, float8, float8, boolean) from public;
grant execute on function public.reports_in_bbox(float8, float8, float8, float8, boolean) to anon, authenticated;

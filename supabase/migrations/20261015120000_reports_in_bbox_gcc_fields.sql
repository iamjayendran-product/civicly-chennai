-- Map pins show where each report stands with GCC ("Filed with GCC #…"), plus the GCC
-- street and landmark. Changing a function's result columns needs drop + create.
drop function if exists public.reports_in_bbox(float8, float8, float8, float8, boolean);

create function public.reports_in_bbox(
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
  created_at timestamptz,
  gcc_status public.gcc_status,
  gcc_complaint_number text,
  gcc_road_name text,
  landmark text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.subtype, r.note, r.lng, r.lat, r.status, r.upvote_count, r.created_at,
         r.gcc_status, r.gcc_complaint_number, r.gcc_road_name, r.landmark
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

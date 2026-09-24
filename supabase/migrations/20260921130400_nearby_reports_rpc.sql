create or replace function public.nearby_reports(
  p_lng float8,
  p_lat float8,
  p_category public.report_category,
  p_radius_m float8 default 25
)
returns table (
  id uuid,
  subtype public.report_subtype,
  upvote_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.subtype, r.upvote_count, r.created_at
  from public.reports r
  where r.is_hidden = false
    and r.status = 'open'
    and r.category = p_category
    and extensions.st_dwithin(
      r.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_m
    )
  order by r.created_at desc
  limit 20;
$$;

revoke execute on function public.nearby_reports(float8, float8, public.report_category, float8) from public;
grant execute on function public.nearby_reports(float8, float8, public.report_category, float8) to anon, authenticated;

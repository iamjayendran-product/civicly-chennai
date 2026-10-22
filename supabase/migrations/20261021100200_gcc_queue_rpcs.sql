-- Admin work queue for the GCC filing log (spec §5). Only open, visible reports appear:
-- a report that becomes fixed or hidden leaves both tabs (product decision 2026-10-21),
-- though its filing record is kept.

create or replace function public.admin_gcc_queue(
  p_tab text,
  p_status public.gcc_status default null,
  p_limit int default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  category public.report_category,
  subtype public.report_subtype,
  note text,
  lng float8,
  lat float8,
  created_at timestamptz,
  upvote_count int,
  reporter_name text,
  reporter_phone text,
  photo_paths text[],
  complaint_id text,
  gcc_status public.gcc_status,
  gcc_note text,
  filed_at timestamptz,
  filing_updated_at timestamptz,
  sort_key timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_tab is null or p_tab not in ('unfiled', 'filed') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
    select q.* from (
      select r.id, r.category, r.subtype, r.note, r.lng, r.lat, r.created_at, r.upvote_count,
             c.name, c.phone,
             coalesce(
               (select array_agg(p.storage_path order by p.created_at)
                  from public.report_photos p
                 where p.report_id = r.id and p.kind = 'report'),
               '{}'::text[]
             ),
             g.complaint_id, g.status, g.note, g.filed_at, g.updated_at,
             case when p_tab = 'filed' then g.updated_at else r.created_at end as sort_key
        from public.reports r
        left join public.gcc_filings g on g.report_id = r.id
        left join public.report_contacts c on c.report_id = r.id
       where r.status = 'open'
         and not r.is_hidden
         and (case when p_tab = 'filed' then g.report_id is not null else g.report_id is null end)
         and (p_status is null or p_tab <> 'filed' or g.status = p_status)
    ) q
    where p_before is null or q.sort_key < p_before
    order by q.sort_key desc, q.id
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke execute on function public.admin_gcc_queue(text, public.gcc_status, int, timestamptz) from public;
grant execute on function public.admin_gcc_queue(text, public.gcc_status, int, timestamptz) to authenticated;

create or replace function public.admin_gcc_counts()
returns table (unfiled int, filed int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  return query
    select (count(*) filter (where g.report_id is null))::int,
           (count(*) filter (where g.report_id is not null))::int
      from public.reports r
      left join public.gcc_filings g on g.report_id = r.id
     where r.status = 'open' and not r.is_hidden;
end;
$$;

revoke execute on function public.admin_gcc_counts() from public;
grant execute on function public.admin_gcc_counts() to authenticated;

create or replace function public.admin_gcc_history(p_report_id uuid)
returns table (complaint_id text, status public.gcc_status, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  return query
    select e.complaint_id, e.status, e.note, e.created_at
      from public.gcc_filing_events e
     where e.report_id = p_report_id
     order by e.created_at, e.id;
end;
$$;

revoke execute on function public.admin_gcc_history(uuid) from public;
grant execute on function public.admin_gcc_history(uuid) to authenticated;

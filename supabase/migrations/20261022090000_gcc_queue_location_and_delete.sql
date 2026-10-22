-- GCC filing log, after merging the GCC service-area work (2026-10-22):
-- 1. The queue also returns what GCC's complaint form asks for: the reporter's gender and
--    the GCC street id/name, zone, ward and landmark captured on the report form.
-- 2. admin_delete_report replaces the old admin "Flag": a soft delete that hides the
--    report from the public map (recoverable by un-hiding it in SQL).

drop function if exists public.admin_gcc_queue(text, public.gcc_status, int, timestamptz);

create function public.admin_gcc_queue(
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
  sort_key timestamptz,
  reporter_gender text,
  gcc_street_id text,
  gcc_road_name text,
  gcc_zone text,
  gcc_ward text,
  landmark text
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
             case when p_tab = 'filed' then g.updated_at else r.created_at end as sort_key,
             c.gender, r.gcc_street_id, r.gcc_road_name, r.gcc_zone, r.gcc_ward, r.landmark
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

revoke execute on function public.admin_gcc_queue(text, public.gcc_status, int, timestamptz) from public, anon;
grant execute on function public.admin_gcc_queue(text, public.gcc_status, int, timestamptz) to authenticated;

create or replace function public.admin_delete_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  update public.reports set is_hidden = true, updated_at = now() where id = p_report_id;
  if not found then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- Realtime postgres_changes can't deliver this UPDATE (RLS hides the row now), so tell
  -- open maps to drop the pin over the public moderation broadcast.
  perform realtime.send(jsonb_build_object('id', p_report_id), 'report_hidden', 'reports-moderation', false);
end;
$$;

revoke execute on function public.admin_delete_report(uuid) from public, anon;
grant execute on function public.admin_delete_report(uuid) to authenticated;

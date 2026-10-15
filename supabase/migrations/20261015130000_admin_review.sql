-- Admin review screen (/admin): an allowlisted admin sees every report with reporter
-- details and can flag one with a single click, which hides it from the public map and
-- stops it being sent to GCC. Admins read and act only through these security-definer
-- RPCs, each gated by is_admin(); no RLS policy is loosened.

create table public.admin_users (
  email text primary key check (email = lower(email))
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
insert into public.admin_users (email) values ('iamjayendran@gmail.com');

-- Signed in (not anonymous) with a confirmed email that is on the admin list.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_users a on a.email = lower(u.email)
    where u.id = (auth.jwt() ->> 'sub')::uuid
      and coalesce(u.is_anonymous, false) = false
      and u.email_confirmed_at is not null
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_require()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.admin_require() from public, anon, authenticated;

-- p_filter: pending (waiting to be sent) | flagged | filed | failed | all.
create or replace function public.admin_list_reports(
  p_filter text default 'pending',
  p_search text default null,
  p_ward text default null,
  p_before timestamptz default null,
  p_limit int default 50
)
returns table (
  id uuid,
  created_at timestamptz,
  category public.report_category,
  subtype public.report_subtype,
  note text,
  lng float8,
  lat float8,
  status public.report_status,
  is_hidden boolean,
  upvote_count int,
  gcc_street_id text,
  gcc_road_name text,
  gcc_zone text,
  gcc_ward text,
  landmark text,
  reporter_name text,
  reporter_phone text,
  gender text,
  gcc_status public.gcc_status,
  attempts int,
  last_error text,
  next_attempt_at timestamptz,
  complaint_number text,
  blocked_reason text,
  reporter_report_count int,
  photo_paths text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();
  return query
  select
    r.id, r.created_at, r.category, r.subtype, r.note, r.lng, r.lat, r.status, r.is_hidden, r.upvote_count,
    r.gcc_street_id, r.gcc_road_name, r.gcc_zone, r.gcc_ward, r.landmark,
    c.name, c.phone, s.gender,
    coalesce(s.status, r.gcc_status), s.attempts, s.last_error, s.next_attempt_at,
    coalesce(s.complaint_number, r.gcc_complaint_number), s.blocked_reason,
    (select count(*)::int from public.report_owners o2 where o2.reporter_id = o.reporter_id),
    coalesce(
      (select array_agg(p.storage_path order by p.created_at, p.id) from public.report_photos p
       where p.report_id = r.id and p.kind = 'report'),
      array[]::text[]
    )
  from public.reports r
  left join public.gcc_submissions s on s.report_id = r.id
  left join public.report_contacts c on c.report_id = r.id
  left join public.report_owners o on o.report_id = r.id
  where (
      p_filter = 'all'
      or (p_filter = 'pending' and s.status in ('pending', 'in_flight') and not r.is_hidden)
      or (p_filter = 'flagged' and (r.is_hidden or s.status = 'blocked'))
      or (p_filter = 'filed' and s.status = 'submitted')
      or (p_filter = 'failed' and s.status = 'failed')
    )
    and (
      nullif(trim(p_search), '') is null
      or strpos(lower(coalesce(c.name, '')), lower(trim(p_search))) > 0
      or strpos(coalesce(c.phone, ''), trim(p_search)) > 0
      or strpos(lower(coalesce(r.note, '')), lower(trim(p_search))) > 0
      or strpos(lower(coalesce(r.gcc_road_name, '')), lower(trim(p_search))) > 0
    )
    and (nullif(trim(p_ward), '') is null or r.gcc_ward = trim(p_ward))
    and (p_before is null or r.created_at < p_before)
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;
revoke execute on function public.admin_list_reports(text, text, text, timestamptz, int) from public, anon;
grant execute on function public.admin_list_reports(text, text, text, timestamptz, int) to authenticated;

-- The same reporter's other reports, keyed by one of their reports so the reporter's
-- user id never leaves the database.
create or replace function public.admin_reporter_reports(p_report_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  category public.report_category,
  subtype public.report_subtype,
  is_hidden boolean,
  gcc_status public.gcc_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();
  return query
  select r.id, r.created_at, r.category, r.subtype, r.is_hidden, r.gcc_status
  from public.report_owners mine
  join public.report_owners o on o.reporter_id = mine.reporter_id and o.report_id <> mine.report_id
  join public.reports r on r.id = o.report_id
  where mine.report_id = p_report_id
  order by r.created_at desc
  limit 50;
end;
$$;
revoke execute on function public.admin_reporter_reports(uuid) from public, anon;
grant execute on function public.admin_reporter_reports(uuid) to authenticated;

create or replace function public.admin_check_reason(p_reason text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is not null and p_reason not in ('spam', 'duplicate', 'not_road_issue', 'abusive_photo', 'other') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.admin_check_reason(text) from public, anon, authenticated;

-- Flag: hide from the public map and stop the GCC send. A report already filed with GCC
-- is still hidden; the result says so (already_filed + its complaint number).
create or replace function public.admin_flag_reports(p_report_ids uuid[], p_reason text default null)
returns table (report_id uuid, already_filed boolean, complaint_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (auth.jwt() ->> 'sub')::uuid;
  v_id uuid;
begin
  perform public.admin_require();
  perform public.admin_check_reason(p_reason);

  foreach v_id in array coalesce(p_report_ids, array[]::uuid[]) loop
    update public.reports set is_hidden = true where id = v_id;
    if not found then
      continue;
    end if;

    update public.gcc_submissions s
    set status = 'blocked', blocked_reason = p_reason, blocked_by = v_admin, blocked_at = now()
    where s.report_id = v_id and s.status in ('pending', 'in_flight', 'failed');
    if found then
      update public.reports set gcc_status = 'blocked' where id = v_id;
    end if;

    -- Realtime postgres_changes can't deliver this UPDATE (RLS hides the row now), so
    -- tell open maps to drop the pin over a public broadcast.
    perform realtime.send(jsonb_build_object('id', v_id), 'report_hidden', 'reports-moderation', false);

    return query
    select v_id, s.status = 'submitted', s.complaint_number
    from (select 1) one
    left join public.gcc_submissions s on s.report_id = v_id;
  end loop;
end;
$$;
revoke execute on function public.admin_flag_reports(uuid[], text) from public, anon;
grant execute on function public.admin_flag_reports(uuid[], text) to authenticated;

create or replace function public.admin_set_flag_reason(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();
  perform public.admin_check_reason(p_reason);
  update public.gcc_submissions set blocked_reason = p_reason where report_id = p_report_id;
end;
$$;
revoke execute on function public.admin_set_flag_reason(uuid, text) from public, anon;
grant execute on function public.admin_set_flag_reason(uuid, text) to authenticated;

-- Undo a flag: back on the map and back in the GCC queue, never sooner than 10 minutes
-- from now (so an undo can't fire a send instantly).
create or replace function public.admin_unflag_reports(p_report_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();

  update public.reports set is_hidden = false where id = any(p_report_ids);

  with requeued as (
    update public.gcc_submissions s
    set status = 'pending',
        next_attempt_at = greatest(s.next_attempt_at, now() + interval '10 minutes'),
        blocked_reason = null, blocked_by = null, blocked_at = null
    where s.report_id = any(p_report_ids) and s.status = 'blocked'
    returning s.report_id
  )
  update public.reports r set gcc_status = 'pending' from requeued where r.id = requeued.report_id;
end;
$$;
revoke execute on function public.admin_unflag_reports(uuid[]) from public, anon;
grant execute on function public.admin_unflag_reports(uuid[]) to authenticated;

-- Retry a failed GCC send on the next forwarder run, with a fresh attempt count.
create or replace function public.admin_retry_gcc(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();
  update public.gcc_submissions
  set status = 'pending', attempts = 0, next_attempt_at = now()
  where report_id = p_report_id and status = 'failed';
  if found then
    update public.reports set gcc_status = 'pending' where id = p_report_id;
  end if;
end;
$$;
revoke execute on function public.admin_retry_gcc(uuid) from public, anon;
grant execute on function public.admin_retry_gcc(uuid) to authenticated;

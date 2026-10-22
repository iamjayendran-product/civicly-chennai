-- Replace the 2026-10-15 automatic GCC forwarder with the manual GCC filing log
-- (docs/superpowers/specs/2026-10-21-gcc-filing-admin-design.md; Jay's decision
-- 2026-10-22). Runs before the filing-log migrations, which reuse the names gcc_status
-- and is_admin. Live data at the time: 2 queue rows, both blocked, nothing ever sent to
-- GCC, no complaint numbers.
--
-- Kept from 2026-10-15: the GCC service area, GCC street/road/zone/ward/landmark on
-- reports, street lookup, and the gender question (moved from the queue to
-- report_contacts, since GCC's complaint form still needs it).

-- 1. Stop the sender.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'gcc-forward') then
    perform cron.unschedule('gcc-forward');
  end if;
end;
$do$;
drop function if exists public.trigger_gcc_forward();
drop function if exists public.claim_gcc_submissions(int);
drop function if exists public.record_gcc_result(uuid, text, text);

-- 2. Keep the reporter's gender with the other private contact data.
alter table public.report_contacts
  add column gender text check (gender in ('male', 'female', 'transgender'));
update public.report_contacts c
   set gender = s.gender
  from public.gcc_submissions s
 where s.report_id = c.report_id;

-- 3. create_report: same signature and checks; gender goes to report_contacts and nothing
--    is queued for GCC.
create or replace function public.create_report(
  p_category public.report_category,
  p_subtype public.report_subtype,
  p_note text,
  p_lng float8,
  p_lat float8,
  p_photo_paths text[],
  p_photo_blurred boolean[] default null,
  p_reporter_name text default null,
  p_reporter_phone text default null,
  p_gender text default null,
  p_gcc_street_id text default null,
  p_gcc_road_name text default null,
  p_gcc_zone text default null,
  p_gcc_ward text default null,
  p_landmark text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_point extensions.geography;
  v_report_id uuid;
  v_ip text;
  v_salt text;
  v_ip_hash text;
  v_path text;
begin
  v_user_id := (auth.jwt() ->> 'sub')::uuid;
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if (p_category = 'other') <> (p_subtype is not null) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- Reports are filed with GCC by hand from the admin GCC filing log; GCC's complaint
  -- form requires a gender and one of its own street ids (road_id from GCC's register).
  if p_gender is null or p_gender not in ('male', 'female', 'transgender') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if nullif(trim(p_gcc_street_id), '') is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_landmark, '')) > 120 or char_length(coalesce(p_gcc_road_name, '')) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_photo_paths is null or array_length(p_photo_paths, 1) is null
     or array_length(p_photo_paths, 1) < 1 or array_length(p_photo_paths, 1) > 3 then
    raise exception 'INVALID_PHOTOS' using errcode = 'P0001';
  end if;
  foreach v_path in array p_photo_paths loop
    if v_path is null or left(v_path, length(v_user_id::text) + 1) <> (v_user_id::text || '/') then
      raise exception 'INVALID_PHOTOS' using errcode = 'P0001';
    end if;
  end loop;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  if not exists (
    select 1 from public.gcc_boundary gb where extensions.st_covers(gb.geom, v_point)
  ) then
    raise exception 'OUTSIDE_GCC' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.rate_events
    where user_id = v_user_id and action = 'report' and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.rate_events
    where user_id = v_user_id and action = 'report' and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- Rightmost x-forwarded-for entry: the only one a client cannot forge (see the
  -- 20260922120000 migration).
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', -1);
  v_ip := nullif(trim(v_ip), '');
  if v_ip is not null then
    select decrypted_secret into v_salt from vault.decrypted_secrets where name = 'road_grievance_ip_salt';
    if v_salt is null then
      raise exception 'road_grievance_ip_salt secret is missing from vault';
    end if;
    v_ip_hash := encode(extensions.digest(v_ip || v_salt, 'sha256'), 'hex');
    if (
      select count(*) from public.rate_events
      where ip_hash = v_ip_hash and action = 'report' and created_at > now() - interval '1 day'
    ) >= 30 then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.reports (
    category, subtype, note, location,
    gcc_street_id, gcc_road_name, gcc_zone, gcc_ward, landmark
  )
  values (
    p_category, p_subtype, p_note, v_point,
    trim(p_gcc_street_id), nullif(trim(p_gcc_road_name), ''), nullif(trim(p_gcc_zone), ''),
    nullif(trim(p_gcc_ward), ''), nullif(trim(p_landmark), '')
  )
  returning id into v_report_id;

  insert into public.report_owners (report_id, reporter_id)
  values (v_report_id, v_user_id);

  insert into public.report_photos (report_id, storage_path, kind, uploaded_by, blurred)
  select
    v_report_id,
    path.value,
    'report',
    v_user_id,
    coalesce(p_photo_blurred[path.ordinality], true)
  from unnest(p_photo_paths) with ordinality as path(value, ordinality);

  if p_reporter_name is not null and p_reporter_phone is not null then
    insert into public.report_contacts (report_id, name, phone, gender)
    values (v_report_id, p_reporter_name, p_reporter_phone, p_gender);
  end if;

  insert into public.rate_events (user_id, ip_hash, action)
  values (v_user_id, v_ip_hash, 'report');

  return v_report_id;
end;
$$;

-- 4. Map pins: GCC street and landmark only, no GCC filing data.
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
  gcc_road_name text,
  landmark text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.subtype, r.note, r.lng, r.lat, r.status, r.upvote_count, r.created_at,
         r.gcc_road_name, r.landmark
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

-- 5. The old admin review screen's RPCs (replaced by the admin_gcc_* RPCs and
--    admin_delete_report). is_admin() is redefined by the next migration.
drop function if exists public.admin_list_reports(text, text, text, timestamptz, int);
drop function if exists public.admin_reporter_reports(uuid);
drop function if exists public.admin_flag_reports(uuid[], text);
drop function if exists public.admin_set_flag_reason(uuid, text);
drop function if exists public.admin_unflag_reports(uuid[]);
drop function if exists public.admin_retry_gcc(uuid);
drop function if exists public.admin_check_reason(text);
drop function if exists public.admin_require();
drop table if exists public.admin_users;

-- 6. Forwarding data and settings.
drop table public.gcc_submissions;
drop table public.app_settings;
alter table public.reports drop column gcc_status, drop column gcc_complaint_number;
drop type public.gcc_status;

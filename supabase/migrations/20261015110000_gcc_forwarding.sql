-- Forward every Civicly report to GCC's grievance system (gccservices.in/pgr).
--
-- create_report now also takes the GCC fields (gender, GCC street, ward/zone, landmark)
-- and queues a gcc_submissions row due after a hold window (app_settings.gcc_hold,
-- default 2 hours) during which an admin can flag it. Every 5 minutes pg_cron calls
-- trigger_gcc_forward(), which POSTs to the Next.js route /api/gcc/forward; that route
-- claims due rows with claim_gcc_submissions(), files them with GCC, and records each
-- outcome with record_gcc_result(). Both of those are service_role only.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Settings (server-only; no grants)
create table public.app_settings (
  key text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('gcc_hold', '"2 hours"');

create type public.gcc_status as enum ('pending', 'in_flight', 'submitted', 'failed', 'blocked');

-- Public, so the map and report page (and Realtime) can show "Filed with GCC #…".
-- gcc_status here mirrors the queue as pending / submitted / failed / blocked.
alter table public.reports
  add column gcc_street_id text,
  add column gcc_road_name text,
  add column gcc_zone text,
  add column gcc_ward text,
  add column landmark text,
  add column gcc_status public.gcc_status,
  add column gcc_complaint_number text;
-- reports uses column-level select grants (20260922120000); these new columns are public.
grant select (gcc_street_id, gcc_road_name, gcc_zone, gcc_ward, landmark, gcc_status, gcc_complaint_number)
  on public.reports to anon, authenticated;

-- One row per report: the forwarding queue. Private: it holds the gender sent to GCC.
create table public.gcc_submissions (
  report_id uuid primary key references public.reports(id) on delete cascade,
  gender text not null check (gender in ('male', 'female', 'transgender')),
  status public.gcc_status not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null,
  claimed_at timestamptz,
  last_error text,
  complaint_number text,
  submitted_at timestamptz,
  blocked_reason text,
  blocked_by uuid references auth.users(id),
  blocked_at timestamptz,
  created_at timestamptz not null default now()
);
create index gcc_submissions_due_idx on public.gcc_submissions (status, next_attempt_at);
alter table public.gcc_submissions enable row level security;
revoke all on public.gcc_submissions from anon, authenticated;

-- Adding parameters makes a new overload, so drop the old signature first (same as the
-- earlier create_report migrations).
drop function if exists public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[], text, text);

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
  -- Every report is filed with GCC, whose complaint form requires a gender and one of
  -- its own street ids (road_id from GCC's street register).
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
    gcc_street_id, gcc_road_name, gcc_zone, gcc_ward, landmark, gcc_status
  )
  values (
    p_category, p_subtype, p_note, v_point,
    trim(p_gcc_street_id), nullif(trim(p_gcc_road_name), ''), nullif(trim(p_gcc_zone), ''),
    nullif(trim(p_gcc_ward), ''), nullif(trim(p_landmark), ''), 'pending'
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
    insert into public.report_contacts (report_id, name, phone)
    values (v_report_id, p_reporter_name, p_reporter_phone);
  end if;

  -- Queued for GCC after the hold window, during which an admin can flag it.
  insert into public.gcc_submissions (report_id, gender, next_attempt_at)
  values (
    v_report_id,
    p_gender,
    now() + coalesce((select (value #>> '{}')::interval from public.app_settings where key = 'gcc_hold'), interval '2 hours')
  );

  insert into public.rate_events (user_id, ip_hash, action)
  values (v_user_id, v_ip_hash, 'report');

  return v_report_id;
end;
$$;

revoke execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[], text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[], text, text, text, text, text, text, text, text) to anon, authenticated;

-- Claim up to p_limit due submissions for sending. An in-flight claim older than 15
-- minutes is treated as abandoned (the forwarder crashed) and can be claimed again.
create or replace function public.claim_gcc_submissions(p_limit int)
returns table (
  report_id uuid,
  category public.report_category,
  subtype public.report_subtype,
  note text,
  lng float8,
  lat float8,
  gcc_street_id text,
  gcc_road_name text,
  gcc_zone text,
  gcc_ward text,
  landmark text,
  reporter_name text,
  gender text,
  photo_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.report_id
    from public.gcc_submissions s
    join public.reports r on r.id = s.report_id
    where r.is_hidden = false
      and r.status = 'open'
      and s.attempts < 5
      and (
        (s.status = 'pending' and s.next_attempt_at <= now())
        or (s.status = 'in_flight' and s.claimed_at < now() - interval '15 minutes')
      )
    order by s.next_attempt_at
    limit greatest(p_limit, 0)
    for update of s skip locked
  ),
  claimed as (
    update public.gcc_submissions s
    set status = 'in_flight', claimed_at = now(), attempts = s.attempts + 1
    from due
    where s.report_id = due.report_id
    returning s.report_id, s.gender
  )
  select
    r.id, r.category, r.subtype, r.note, r.lng, r.lat,
    r.gcc_street_id, r.gcc_road_name, r.gcc_zone, r.gcc_ward, r.landmark,
    c.name, claimed.gender,
    (select p.storage_path from public.report_photos p
     where p.report_id = r.id and p.kind = 'report' order by p.created_at, p.id limit 1)
  from claimed
  join public.reports r on r.id = claimed.report_id
  left join public.report_contacts c on c.report_id = r.id;
end;
$$;

revoke execute on function public.claim_gcc_submissions(int) from public, anon, authenticated;
grant execute on function public.claim_gcc_submissions(int) to service_role;

-- Record one send attempt. A complaint number means GCC filed it — recorded even if an
-- admin flagged the report meanwhile, since it is filed either way. Otherwise retry with
-- backoff (5m, 30m, 2h, 12h) until the 5th attempt, then mark it failed.
create or replace function public.record_gcc_result(p_report_id uuid, p_complaint_number text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts int;
begin
  if nullif(trim(p_complaint_number), '') is not null then
    update public.gcc_submissions
    set status = 'submitted', complaint_number = trim(p_complaint_number), submitted_at = now(), last_error = null
    where report_id = p_report_id;
    update public.reports
    set gcc_status = 'submitted', gcc_complaint_number = trim(p_complaint_number)
    where id = p_report_id;
    return;
  end if;

  select attempts into v_attempts
  from public.gcc_submissions
  where report_id = p_report_id and status = 'in_flight'
  for update;
  if not found then
    return;
  end if;

  if v_attempts >= 5 then
    update public.gcc_submissions set status = 'failed', last_error = left(p_error, 500)
    where report_id = p_report_id;
    update public.reports set gcc_status = 'failed' where id = p_report_id;
  else
    update public.gcc_submissions
    set status = 'pending',
        last_error = left(p_error, 500),
        next_attempt_at = now() + (array[interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours'])[v_attempts]
    where report_id = p_report_id;
  end if;
end;
$$;

revoke execute on function public.record_gcc_result(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_gcc_result(uuid, text, text) to service_role;

-- Called by pg_cron. The forwarder URL and shared secret live in Vault
-- (gcc_forward_url, gcc_forward_secret); until both are set this does nothing.
create or replace function public.trigger_gcc_forward()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'gcc_forward_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'gcc_forward_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-gcc-forward-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.trigger_gcc_forward() from public, anon, authenticated;

select cron.schedule('gcc-forward', '*/5 * * * *', 'select public.trigger_gcc_forward()');

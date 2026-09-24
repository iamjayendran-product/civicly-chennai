-- The Submit dialog collects a mandatory Name + Phone from the reporter (enforced
-- client-side only, per product decision — not a server-side business rule like the
-- CMDA/rate-limit checks below). Store them the same way reporter identity itself is
-- stored: a separate default-deny table only create_report can ever write, never on
-- public.reports/report_photos and never exposed via the Data API or Realtime.

create table public.report_contacts (
  report_id uuid primary key references public.reports(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

alter table public.report_contacts enable row level security;
-- No select/insert/update/delete policy, and no grants: unreachable from the Data API,
-- same pattern as public.report_owners.
revoke all on public.report_contacts from anon, authenticated;

-- `create or replace function` cannot replace the prior 7-parameter signature in
-- place — adding parameters (even with defaults) makes this a distinct overload, and
-- Postgres does not prefer the exact-arity match, so a 7-argument call becomes
-- ambiguous between the two overloads ("is not unique"). Drop the old signature first,
-- same as the two prior create_report migrations did.
drop function if exists public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[]);

create or replace function public.create_report(
  p_category public.report_category,
  p_subtype public.report_subtype,
  p_note text,
  p_lng float8,
  p_lat float8,
  p_photo_paths text[],
  p_photo_blurred boolean[] default null,
  p_reporter_name text default null,
  p_reporter_phone text default null
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
    select 1 from public.cmda_boundary cb where extensions.st_covers(cb.geom, v_point)
  ) then
    raise exception 'OUTSIDE_CMDA' using errcode = 'P0001';
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

  -- Each proxy hop APPENDS the address it received the request from to
  -- `x-forwarded-for`, so the RIGHTMOST entry is the one our own edge observed and the
  -- only one a client cannot forge; every entry to its left is attacker-controlled.
  -- Taking the leftmost entry let any client mint a fresh rate-limit bucket per request.
  -- (split_part with a negative index counts from the right; PG 14+.)
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', -1);
  v_ip := nullif(trim(v_ip), '');
  if v_ip is not null then
    select decrypted_secret into v_salt from vault.decrypted_secrets where name = 'road_grievance_ip_salt';
    -- A missing salt made `v_ip || v_salt` NULL, so the hash was NULL, so the per-IP cap
    -- silently matched nothing and disabled itself. That is a deployment error, not a
    -- user-facing validation failure, so it fails loudly as an ordinary exception rather
    -- than as one of the five typed P0001 codes.
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

  insert into public.reports (category, subtype, note, location)
  values (p_category, p_subtype, p_note, v_point)
  returning id into v_report_id;

  insert into public.report_owners (report_id, reporter_id)
  values (v_report_id, v_user_id);

  -- blurred defaults to true (today's behavior) only when p_photo_blurred is null;
  -- otherwise it's taken positionally from p_photo_blurred, same order as p_photo_paths.
  insert into public.report_photos (report_id, storage_path, kind, uploaded_by, blurred)
  select
    v_report_id,
    path.value,
    'report',
    v_user_id,
    coalesce(p_photo_blurred[path.ordinality], true)
  from unnest(p_photo_paths) with ordinality as path(value, ordinality);

  -- Only stored when both are provided — "mandatory" is enforced by the client's
  -- Submit dialog, not this RPC, so a caller that omits them simply gets no row here.
  if p_reporter_name is not null and p_reporter_phone is not null then
    insert into public.report_contacts (report_id, name, phone)
    values (v_report_id, p_reporter_name, p_reporter_phone);
  end if;

  insert into public.rate_events (user_id, ip_hash, action)
  values (v_user_id, v_ip_hash, 'report');

  return v_report_id;
end;
$$;

revoke execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[], text, text) from public;
grant execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[], boolean[], text, text) to anon, authenticated;

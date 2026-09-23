-- Reporter identity must never reach a client.
--
-- `reports.reporter_id` was readable two ways: PostgREST `select` by `anon` (RLS is
-- row-level only, and Supabase auto-grants column select on new tables), and — more
-- importantly — the Realtime `postgres_changes` broadcast, since `public.reports` is in
-- the `supabase_realtime` publication and the WAL row is what gets shipped. Column-level
-- GRANTs alone are not a guarantee we want to depend on for the broadcast path, so the
-- column is moved out of `public.reports` entirely, into a default-deny side table that
-- only `security definer` RPCs can ever read.

-- 1. Ownership side table. Same default-deny pattern as public.rate_events.
create table public.report_owners (
  report_id uuid primary key references public.reports(id) on delete cascade,
  reporter_id uuid not null references auth.users(id)
);
create index report_owners_reporter_id_idx on public.report_owners (reporter_id);

alter table public.report_owners enable row level security;
-- No select/insert/update/delete policy, and no grants: unreachable from the Data API.
-- (Supabase's `auto_expose_new_tables` grants the Data API roles access to new public
-- tables by default, so the revoke below is what actually closes it; RLS is the belt.)
revoke all on public.report_owners from anon, authenticated;

-- 2. Backfill from the column about to be dropped.
insert into public.report_owners (report_id, reporter_id)
select id, reporter_id from public.reports;

-- 3. Drop the column. This also removes it from the Realtime WAL payload.
alter table public.reports drop column reporter_id;

-- 4. report_photos: not in the realtime publication, so column-level grants fully close
--    it. Nothing public needs `uploaded_by` (reporter identity) or `storage_path`.
revoke select on public.report_photos from anon, authenticated;
grant select (id, report_id, kind, blurred, created_at) on public.report_photos to anon, authenticated;

-- 5. reports: defence in depth. These are exactly the columns that are legitimately
--    public — the nine returned by `reports_in_bbox`, plus the counters/flags and
--    timestamps the map's Realtime handler reads (`is_hidden`, `status`, `updated_at`).
--    `location` is deliberately excluded: `lng`/`lat` already expose the same point and
--    nothing client-side reads the geography column.
revoke select on public.reports from anon, authenticated;
grant select (id, category, subtype, note, lng, lat, status, upvote_count,
              flag_count, fix_confirm_count, is_hidden, created_at, updated_at,
              fixed_at) on public.reports to anon, authenticated;

-- 6. create_report: write ownership to report_owners instead of reports, and fix two
--    per-IP rate-limit bugs (see inline comments). Everything else is unchanged.
create or replace function public.create_report(
  p_category public.report_category,
  p_subtype public.report_subtype,
  p_note text,
  p_lng float8,
  p_lat float8,
  p_photo_paths text[]
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

  insert into public.report_photos (report_id, storage_path, kind, uploaded_by)
  select v_report_id, path, 'report', v_user_id
  from unnest(p_photo_paths) as path;

  insert into public.rate_events (user_id, ip_hash, action)
  values (v_user_id, v_ip_hash, 'report');

  return v_report_id;
end;
$$;

revoke execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[]) from public;
grant execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[]) to anon, authenticated;

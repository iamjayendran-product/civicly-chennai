-- One-time salt for hashing client IPs. Never store raw IPs.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'road_grievance_ip_salt', 'Salt for hashing reporter IP addresses for rate limiting');

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

  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  v_ip := nullif(trim(v_ip), '');
  if v_ip is not null then
    select decrypted_secret into v_salt from vault.decrypted_secrets where name = 'road_grievance_ip_salt';
    v_ip_hash := encode(extensions.digest(v_ip || v_salt, 'sha256'), 'hex');
    if (
      select count(*) from public.rate_events
      where ip_hash = v_ip_hash and action = 'report' and created_at > now() - interval '1 day'
    ) >= 30 then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.reports (category, subtype, note, location, reporter_id)
  values (p_category, p_subtype, p_note, v_point, v_user_id)
  returning id into v_report_id;

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

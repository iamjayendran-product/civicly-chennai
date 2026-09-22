-- Extensions
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Enums
create type public.report_category as enum ('pothole', 'waterlogging', 'other');
create type public.report_subtype as enum (
  'open_manhole', 'debris', 'damaged_footpath', 'dug_up_road',
  'speed_breaker', 'signage', 'other'
);
create type public.report_status as enum ('open', 'fixed');

-- CMDA boundary (seeded in supabase/seed.sql)
create table public.cmda_boundary (
  id int primary key default 1 check (id = 1),
  geom extensions.geography(MultiPolygon, 4326) not null
);

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  category public.report_category not null,
  subtype public.report_subtype,
  note text check (char_length(note) <= 280),
  location extensions.geography(Point, 4326) not null,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  status public.report_status not null default 'open',
  reporter_id uuid not null references auth.users(id),
  upvote_count int not null default 0,
  flag_count int not null default 0,
  fix_confirm_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fixed_at timestamptz,
  check ((category = 'other') = (subtype is not null))
);
create index reports_location_idx on public.reports using gist (location);
create index reports_created_at_idx on public.reports (created_at desc);

-- Report photos
create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('report', 'fix')),
  blurred boolean not null default true,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index report_photos_report_id_idx on public.report_photos (report_id);

-- Rate limiting log (per user and per hashed IP)
create table public.rate_events (
  id bigserial primary key,
  user_id uuid not null,
  ip_hash text,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_user_action_idx on public.rate_events (user_id, action, created_at desc);
create index rate_events_ip_action_idx on public.rate_events (ip_hash, action, created_at desc);

-- RLS: select-only for public data, no direct writes anywhere in this slice.
alter table public.cmda_boundary enable row level security;
create policy "cmda_boundary_select" on public.cmda_boundary for select to anon, authenticated using (true);

alter table public.reports enable row level security;
create policy "reports_select_not_hidden" on public.reports for select to anon, authenticated using (is_hidden = false);

alter table public.report_photos enable row level security;
create policy "report_photos_select_not_hidden" on public.report_photos for select to anon, authenticated using (
  exists (select 1 from public.reports r where r.id = report_photos.report_id and r.is_hidden = false)
);

alter table public.rate_events enable row level security;
-- No policies: rate_events is never read or written directly by anon/authenticated, only by RPCs.

-- Realtime: only reports broadcasts to clients.
alter publication supabase_realtime add table public.reports;

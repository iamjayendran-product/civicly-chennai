-- Demo data for the LOCAL dev database only: 30 potholes + 20 waterlogging reports at
-- random spots inside the CMDA boundary, so the map has something to show.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f scripts/seed-demo-reports.sql
--
-- Safe to re-run: it first removes any reports it created earlier (they all belong to
-- one dedicated demo user), then inserts a fresh set. Remove everything it made with:
--   delete from public.reports where id in
--     (select report_id from public.report_owners
--      where reporter_id = '00000000-0000-4000-8000-000000000d3e');
--
-- Writes directly as the postgres role (bypassing create_report's rate limits and photo
-- requirement), so never run this against a real/hosted project.

begin;

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000d3e', 'authenticated', 'authenticated', true, now(), now())
on conflict (id) do nothing;

delete from public.reports
where id in (
  select report_id from public.report_owners
  where reporter_id = '00000000-0000-4000-8000-000000000d3e'
);

with points as (
  -- Uniformly random points inside the boundary polygon: every one is covered by the
  -- CMDA geometry by construction, so none can trip OUTSIDE_CMDA.
  select (st_dump(extensions.st_generatepoints(cb.geom::extensions.geometry, 50))).geom as geom
  from public.cmda_boundary cb
),
numbered as (
  select geom, row_number() over (order by random()) as n from points
),
notes as (
  select array[
    'Deep pothole right in the middle of the lane',
    'Water stagnant for two days after the rain',
    'Road caved in near the junction, two wheelers skidding',
    'Pothole outside the school gate',
    'Knee-deep water after every shower',
    'Edge of the road eroded, very dangerous at night',
    'Potholes all along this stretch',
    'Drain overflowing onto the road',
    'Big crater near the bus stop',
    'Flooded underpass, vehicles getting stuck'
  ] as pool
),
new_reports as (
  insert into public.reports (category, note, location, upvote_count, created_at, updated_at)
  select
    case when n <= 30 then 'pothole' else 'waterlogging' end::public.report_category,
    -- About two thirds carry a short note.
    case when random() < 0.67 then (select pool[1 + floor(random() * 10)::int] from notes) end,
    geom::extensions.geography,
    -- Roughly a quarter have already been confirmed by other citizens.
    case when random() < 0.25 then 1 + floor(random() * 5)::int else 0 end,
    now() - (random() * interval '14 days'),
    now()
  from numbered
  returning id
)
insert into public.report_owners (report_id, reporter_id)
select id, '00000000-0000-4000-8000-000000000d3e' from new_reports;

commit;

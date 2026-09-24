create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

-- ~10m away, same category, open -> candidate
with ins as (
  insert into public.reports (category, location)
  values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27009, 13.06), 4326)::extensions.geography)
  returning id
)
insert into public.report_owners (report_id, reporter_id)
select id, '44444444-4444-4444-4444-444444444444' from ins;

-- ~10m away, different category -> not a candidate
with ins as (
  insert into public.reports (category, location)
  values ('waterlogging', extensions.st_setsrid(extensions.st_makepoint(80.27009, 13.06), 4326)::extensions.geography)
  returning id
)
insert into public.report_owners (report_id, reporter_id)
select id, '44444444-4444-4444-4444-444444444444' from ins;

-- ~10m away, same category, but fixed -> not a candidate
with ins as (
  insert into public.reports (category, location, status)
  values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.26991, 13.06), 4326)::extensions.geography, 'fixed')
  returning id
)
insert into public.report_owners (report_id, reporter_id)
select id, '44444444-4444-4444-4444-444444444444' from ins;

-- Far away (~1km), same category -> not a candidate at the default 25m radius
with ins as (
  insert into public.reports (category, location)
  values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.28, 13.06), 4326)::extensions.geography)
  returning id
)
insert into public.report_owners (report_id, reporter_id)
select id, '44444444-4444-4444-4444-444444444444' from ins;

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'pothole')),
  1,
  'only the one open, same-category, in-radius report is returned'
);

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'waterlogging')),
  1,
  'the waterlogging category returns its own matching report'
);

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'pothole', 2000)),
  2,
  'widening the radius to 2000m picks up the far-away pothole report too'
);

select is(
  (select count(*)::int from public.nearby_reports(0, 0, 'pothole')),
  0,
  'no reports near an unrelated point'
);

select * from finish();
rollback;

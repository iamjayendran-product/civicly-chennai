create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

-- Inside the test bbox (80.20-80.30, 13.00-13.10)
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333');

-- Outside the test bbox
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.10, 12.90), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333');

-- Inside the bbox but hidden
insert into public.reports (category, location, reporter_id, is_hidden)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.28, 13.07), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333', true);

-- Inside the bbox but fixed
insert into public.reports (category, location, reporter_id, status)
values ('waterlogging', extensions.st_setsrid(extensions.st_makepoint(80.22, 13.02), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333', 'fixed');

select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, false)),
  1,
  'only the one open, non-hidden report inside the bbox is returned by default'
);

select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, true)),
  2,
  'passing include_fixed=true also returns the fixed report inside the bbox'
);

select is(
  (select count(*)::int from public.reports_in_bbox(0, 0, 1, 1, false)),
  0,
  'a bbox with no reports returns zero rows'
);

-- The 2000-row cap
insert into public.reports (category, location, reporter_id)
select 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.25, 13.05), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333'
from generate_series(1, 2005);
select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, false)),
  2000,
  'reports_in_bbox caps results at 2000 rows'
);

select * from finish();
rollback;

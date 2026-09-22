create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

select is(
  (select count(*)::int from public.cmda_boundary),
  1,
  'cmda_boundary has exactly one row'
);

select ok(
  (select extensions.st_isvalid(geom::extensions.geometry) from public.cmda_boundary where id = 1),
  'seeded boundary geometry is valid'
);

select ok(
  (select extensions.st_area(geom) / 1000000 between 1000 and 1400 from public.cmda_boundary where id = 1),
  'seeded boundary area is within the expected ~1200 km2 range for the CMA'
);

-- Anna Salai, central Chennai, must be inside the boundary.
select ok(
  (select extensions.st_covers(
    geom,
    extensions.st_setsrid(extensions.st_makepoint(80.2707, 13.0604), 4326)::extensions.geography
  ) from public.cmda_boundary where id = 1),
  'a point in central Chennai is covered by the CMDA boundary'
);

select * from finish();
rollback;

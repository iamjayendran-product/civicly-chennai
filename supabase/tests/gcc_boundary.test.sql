create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

select is(
  (select count(*)::int from public.gcc_boundary),
  1,
  'gcc_boundary has exactly one row'
);

select ok(
  (select extensions.st_isvalid(geom::extensions.geometry) from public.gcc_boundary where id = 1),
  'seeded GCC boundary geometry is valid'
);

select ok(
  (select extensions.st_area(geom) / 1000000 between 400 and 480 from public.gcc_boundary where id = 1),
  'seeded GCC boundary area is within the expected ~426 km2 range'
);

-- Vadapalani (inside GCC)
select ok(
  (select extensions.st_covers(
    geom,
    extensions.st_setsrid(extensions.st_makepoint(80.204032, 13.052020), 4326)::extensions.geography
  ) from public.gcc_boundary where id = 1),
  'Vadapalani is covered by the GCC boundary'
);

-- Tambaram and Avadi are in the CMDA but outside GCC limits
select ok(
  (select not extensions.st_covers(
    geom,
    extensions.st_setsrid(extensions.st_makepoint(80.1180, 12.9249), 4326)::extensions.geography
  ) from public.gcc_boundary where id = 1),
  'Tambaram is outside the GCC boundary'
);

select ok(
  (select not extensions.st_covers(
    geom,
    extensions.st_setsrid(extensions.st_makepoint(80.1013, 13.1147), 4326)::extensions.geography
  ) from public.gcc_boundary where id = 1),
  'Avadi is outside the GCC boundary'
);

select * from finish();
rollback;

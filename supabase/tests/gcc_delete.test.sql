create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

insert into public.reports (id, category, location) values
  ('d0000000-0000-0000-0000-00000000000d', 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography);

set local role authenticated;

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false,"email":"someone@else.com","amr":[{"method":"otp","timestamp":1}]}';
select throws_ok(
  $$ select public.admin_delete_report('d0000000-0000-0000-0000-00000000000d') $$,
  'P0001', 'AUTH_REQUIRED', 'a non-admin cannot delete a report'
);

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com","amr":[{"method":"otp","timestamp":1}]}';
select lives_ok(
  $$ select public.admin_delete_report('d0000000-0000-0000-0000-00000000000d') $$,
  'the admin can delete a report'
);
select throws_ok(
  $$ select public.admin_delete_report('99999999-9999-9999-9999-999999999999') $$,
  'P0001', 'INVALID_INPUT', 'deleting an unknown report is rejected'
);

reset role;
select is(
  (select is_hidden from public.reports where id = 'd0000000-0000-0000-0000-00000000000d'),
  true,
  'delete hides the report from the public (soft delete, recoverable)'
);
select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, true) where id = 'd0000000-0000-0000-0000-00000000000d'),
  0,
  'a deleted report is no longer on the map'
);

select * from finish();
rollback;

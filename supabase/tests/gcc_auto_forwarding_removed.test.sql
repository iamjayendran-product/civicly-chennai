create extension if not exists pgtap with schema extensions;

-- The 2026-10-15 automatic GCC forwarder was replaced by the manual filing log
-- (docs/superpowers/specs/2026-10-21-gcc-filing-admin-design.md). Nothing of it may keep
-- running or holding data.
begin;
select plan(10);

select is(
  (select count(*)::int from cron.job where jobname = 'gcc-forward'),
  0,
  'the gcc-forward cron job is unscheduled'
);
select hasnt_table('public', 'gcc_submissions', 'the forwarding queue is gone');
select hasnt_table('public', 'app_settings', 'the forwarding hold setting is gone');
select hasnt_table('public', 'admin_users', 'the old admin allowlist is gone');
select hasnt_column('public', 'reports', 'gcc_complaint_number', 'reports no longer carry an auto-filed complaint number');
select hasnt_column('public', 'reports', 'gcc_status', 'reports no longer carry the old forwarding status');
select hasnt_function('public', 'trigger_gcc_forward', 'the forwarder trigger function is gone');
select hasnt_function('public', 'admin_flag_reports', 'the old admin flag RPC is gone');
select has_column('public', 'report_contacts', 'gender', 'gender now lives with the reporter contact');
select enum_has_labels('public', 'gcc_status',
  array['registered', 'forwarded', 'processing', 'completed', 'rejected', 'reopened', 'withdrawn', 'not_completed'],
  'gcc_status is the manual-filing status list');

select * from finish();
rollback;

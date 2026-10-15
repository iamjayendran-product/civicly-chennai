-- One-time setup for GCC forwarding and the admin screen, per environment.
-- Run in the SQL editor (or psql) as postgres. Not a migration: it holds secrets.

-- 1. Where pg_cron should send the forward trigger, and the shared secret it sends.
--    The secret must equal GCC_FORWARD_SECRET in the Next.js environment.
select vault.create_secret('https://YOUR-SITE.example/api/gcc/forward', 'gcc_forward_url', 'GCC forwarder route');
select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-SECRET', 'gcc_forward_secret', 'Shared secret for /api/gcc/forward');
-- To change one later:
--   select vault.update_secret((select id from vault.secrets where name = 'gcc_forward_url'), 'https://…/api/gcc/forward');

-- 2. The hold before a report is sent to GCC (default 2 hours).
--   update public.app_settings set value = '"2 hours"' where key = 'gcc_hold';

-- 3. Admins: create the user once in the dashboard (Authentication → Add user → the
--    email, "Auto confirm"), add {SITE_URL}/admin/auth/callback to Auth → URL
--    configuration → Redirect URLs, and keep the email on the allowlist:
--   insert into public.admin_users (email) values ('someone@example.com');

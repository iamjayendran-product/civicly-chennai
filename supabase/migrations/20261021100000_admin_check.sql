-- Single-admin check for the GCC filing log at /admin (spec:
-- docs/superpowers/specs/2026-10-21-gcc-filing-admin-design.md §3). The one admin is
-- hard-coded by product decision (2026-10-21): no admin table, no seed step. Changing
-- the admin means a new migration.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'iamjayendran@gmail.com';
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- The one admin function that never raises: the /admin page uses it to decide between
-- the sign-in form and the queue. Purely cosmetic — every other admin_* RPC re-checks.
create or replace function public.admin_whoami()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

revoke execute on function public.admin_whoami() from public;
grant execute on function public.admin_whoami() to anon, authenticated;

-- Harden is_admin() (final review, 2026-10-22): the email claim alone isn't proof of
-- inbox ownership. With email confirmation off, anyone can sign up with a password for
-- the admin address before Jay first signs in and get a non-anonymous JWT carrying it.
-- Require that the session itself was established by an email OTP / magic link — the
-- only admin sign-in method (spec §3) and one that proves access to the inbox. The `amr`
-- claim keeps the original sign-in method across token refreshes.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'iamjayendran@gmail.com'
     and exists (
       select 1
         from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m(entry)
        where m.entry ->> 'method' in ('otp', 'magiclink')
     );
$$;

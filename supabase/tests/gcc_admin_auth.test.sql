create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- No JWT at all: not an admin.
select is(public.admin_whoami(), false, 'no JWT is not an admin');

set local role authenticated;

-- The admin email, in any case, on a non-anonymous session.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false,"email":"IamJayendran@Gmail.com","amr":[{"method":"otp","timestamp":1}]}';
select is(public.admin_whoami(), true, 'the admin email matches case-insensitively');

-- Same email on an anonymous session must not count.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":true,"email":"iamjayendran@gmail.com"}';
select is(public.admin_whoami(), false, 'an anonymous session carrying the admin email is not an admin');

-- A different signed-in email.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","is_anonymous":false,"email":"someone@else.com","amr":[{"method":"otp","timestamp":1}]}';
select is(public.admin_whoami(), false, 'a different email is not an admin');

-- Non-anonymous with no email claim.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","is_anonymous":false}';
select is(public.admin_whoami(), false, 'a session without an email claim is not an admin');

-- The admin email on a session that wasn't established by a magic link (e.g. someone
-- else signed up with a password for that address while email confirmation is off).
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com","amr":[{"method":"password","timestamp":1}]}';
select is(public.admin_whoami(), false, 'a password session for the admin email is not an admin');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","is_anonymous":false,"email":"iamjayendran@gmail.com"}';
select is(public.admin_whoami(), false, 'a session with no amr claim is not an admin');

select * from finish();
rollback;

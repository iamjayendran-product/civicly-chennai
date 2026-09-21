# supabase/ — database, RLS, RPC

Everything that enforces a rule lives here. See spec §5 for the schema and function list.

## Layout

- `migrations/` — ordered SQL migrations (append-only; add new files, never edit old).
- `seed.sql` — CMDA boundary polygon (single row in `cmda_boundary`) + sample reports.
- `tests/` — pgTAP tests, one file per concern (`create_report.test.sql`, `votes.test.sql`, …).

## Rules for writing SQL here

- Geography type is `geography(…, 4326)`; build points with
  `extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography`
  — **lng first**.
- Boundary check: `ST_Covers(cmda_boundary.geom, point)`.
- Every RPC: `security definer`, `set search_path = ''`, fully qualified names
  (`public.reports`, `extensions.st_dwithin`), explicit `grant execute` to the right
  roles, `revoke` from `public`.
- Non-anonymous check: `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false`,
  else `raise exception 'AUTH_REQUIRED' using errcode = 'P0001'`.
- Errors: `raise exception '<CODE>' using errcode = 'P0001'` with codes from the root
  CLAUDE.md. Don't invent new codes without adding them to the client i18n catalog.
- Counters (`upvote_count`, `flag_count`, `fix_confirm_count`) are updated in the same
  RPC transaction as the row insert; thresholds (3 flags → hidden, 2 fix confirmations
  → fixed) are applied there too.
- Photo paths passed to RPCs must start with `auth.uid()::text || '/'`.
- Only `public.reports` is in the `supabase_realtime` publication.
- RLS enabled on every table. No `insert/update/delete` policies on domain tables
  (writes via RPC only), except user-scoped `push_subscriptions`.

## Testing

`npx supabase test db`. Each test sets the JWT claims to simulate anon vs Google users:
`set local request.jwt.claims = '{"sub":"…","role":"authenticated","is_anonymous":true}';`
Cover both the happy path and every error code.

# Chennai Road Grievance — MVP Design

- **Date:** 2026-09-21
- **Status:** Approved in brainstorming, pending written-spec review
- **Scope:** Citizen-facing MVP, Chennai Metropolitan Area (CMDA) only

## 1. Problem & Goal

Citizens of Chennai have no fast, public, visual way to report potholes and other road
problems. The MVP lets anyone report a road issue in under 30 seconds with a photo and a
pin, and makes that report appear **live** on a public map for everyone viewing it.

### Success criteria

- A first-time visitor can submit a report without creating an account.
- A submitted report appears on every open map (other browsers) within ~2 seconds.
- Reports outside the CMDA boundary are rejected.
- Obvious abuse (floods of reports, fake pins, ballot-stuffing) is contained without an
  admin team.
- Runs within Supabase / Vercel / map-tile free tiers at pilot scale (< 10k reports).

### Non-goals (MVP)

Tamil UI (i18n scaffolding only), admin/moderator dashboard, severity ratings,
forwarding to GCC or other civic bodies, official/contractor accounts, video uploads,
native apps, phone OTP login, SMS/email notifications.

## 2. Decisions

| Area | Decision |
|---|---|
| Platform | Mobile-first Progressive Web App (installable) |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Backend | Supabase: Postgres + PostGIS, Realtime, Storage, Auth |
| Map | MapLibre GL JS + OpenStreetMap vector tiles (MapTiler/Protomaps free tier) |
| Hosting | Vercel (web), Supabase Cloud (backend) |
| Language | English only; all strings via an i18n message catalog |
| Geography | Chennai Metropolitan Area (CMDA) polygon |
| Identity | Silent Supabase anonymous session for everyone; Google One Tap for "extras" |
| Bot protection | Cloudflare Turnstile (invisible) on anonymous session creation |
| Business rules | Enforced in Postgres functions (RPC), not in the Next.js layer |
| Realtime | Supabase Realtime `postgres_changes` on `reports` |
| Notifications | Web Push (VAPID) from the PWA |
| Later option | WhatsApp OTP login as a second sign-in method |

### Why rules live in Postgres

The client talks to Supabase directly. If validation lived only in Next.js API routes,
anyone with the anon key could bypass it. Putting boundary checks, rate limits, dedupe
and vote-thresholds inside `SECURITY DEFINER` functions (with RLS denying direct writes)
makes them impossible to skip, keeps them transactional, and costs nothing extra.

## 3. Users & Identity

| Capability | Anonymous session | Google-signed-in |
|---|---|---|
| View map / report pages | ✅ | ✅ |
| Submit report | ✅ | ✅ |
| "My reports" (this device) | ✅ | ✅ (all devices) |
| +1 an existing report (`confirm_same_issue`) | ✅ | ✅ |
| Flag as fake/spam | ❌ | ✅ |
| Confirm "fixed" (with photo) | ❌ | ✅ |
| Comment | ❌ | ✅ |
| Web push when own report is fixed | ❌ | ✅ |

- On first load the app calls `signInAnonymously({ options: { captchaToken } })` with an
  invisible Turnstile token.
- Signing in with Google **links** the identity to the existing anonymous user
  (`linkIdentity`), so prior reports stay attributed. If the Google account already
  exists, the anonymous user's reports are re-parented to it by an RPC.
- Identity uniqueness = Supabase user id, backed by a salted SHA-256 hash of the client
  IP for rate limiting (raw IPs are never stored).
- **(Amended 2026-09-25)** +1 no longer requires a Google-linked account — it uses the
  same anonymous-session bar as submitting a report, via `confirm_same_issue` (increments
  the target report's `upvote_count`, rate-limited per user like `create_report`; no
  per-user dedup table, so this is intentionally a lighter bar than a real "vote"). Flag,
  confirm-fixed, comments and push are unaffected and still require Google sign-in.

## 4. Features

### 4.1 Report an issue

Single screen, bottom-sheet flow:

1. **Category** (required): `pothole`, `waterlogging`, `other`.
   `other` requires a **subtype**: `open_manhole`, `debris`, `damaged_footpath`,
   `dug_up_road`, `speed_breaker`, `signage`, `other`.
2. **Photos** (required, 1–3). Client-side pipeline before upload:
   decode → auto-orient → resize to max 1600px long edge → **blur faces and licence
   plates** (in-browser model) → re-encode JPEG q≈0.8 (drops all EXIF).
3. **Location** (required): starts at device GPS; user can drag the pin. If GPS is denied,
   the map opens centred on Chennai and the user taps to place the pin.
4. **Nearby duplicates**: once the pin settles, show open reports of the same category
   within 25 m. Each has "Same issue — +1" (any session, anonymous included, per the
   2026-09-25 amendment in §3) or the user may continue.
5. **Note** (optional, ≤ 280 chars).
6. **Submit** → upload photos to Storage → call `create_report` RPC.

Server rejects with a typed error code when:

- `OUTSIDE_CMDA` — point not within the CMDA polygon.
- `RATE_LIMITED` — > 5 reports/hour or > 20/day per user, or > 30/day per IP hash.
- `INVALID_PHOTOS` — 0 or > 3 photos, or paths not owned by the caller.
- `INVALID_INPUT` — bad category/subtype/note length.

On success the reporter's map shows the pin immediately (optimistic), reconciled by the
Realtime event.

### 4.2 Live map

- Full-screen MapLibre map, bounded to the CMDA extent.
- Initial load: `reports_in_bbox(min_lng, min_lat, max_lng, max_lat)` for the viewport,
  refetched (debounced) on pan/zoom; results clustered client-side.
- Subscribes to Realtime `INSERT`/`UPDATE` on `public.reports`; hidden reports are
  removed, new ones added, status changes restyle the pin.
- Pin style by status: **open** = red, **fixed** = grey. Filter chips per category and
  "show fixed".
- Tapping a pin opens a sheet with photos, category, age, +1 count, actions.

### 4.3 Report page `/r/[id]`

Server-rendered page with Open Graph tags (photo, category, locality) so WhatsApp/X
share previews work. Shows photos, mini-map, status, +1s, comments, actions.

### 4.4 Community lifecycle

- **+1**: one per user per report. Increments `upvote_count`.
- **Flag**: one per user per report. At **3 distinct flags** → `is_hidden = true`
  (hidden from map and bbox queries; report page shows "Removed by community").
- **Confirm fixed**: requires one photo. At **2 confirmations from distinct users**
  (the original reporter may be one of them) → `status = 'fixed'`, `fixed_at` set, push notification
  sent to the reporter if subscribed.
- **Comments**: plain text ≤ 500 chars, signed-in only, rate-limited 10/hour.

### 4.5 My reports

List of the current user's reports with status. Anonymous users see a banner: "Sign in
with Google to keep these on every device and get notified when they're fixed."

### 4.6 Notifications

Web Push via VAPID. Signed-in users opt in on the report success screen or My Reports.
A Supabase Database Webhook on `reports` status → `fixed` calls a Next.js route
`/api/push/report-fixed` which sends to the reporter's subscriptions (secret-authenticated).

## 5. Data Model (Postgres + PostGIS)

```sql
-- enums
create type report_category as enum ('pothole','waterlogging','other');
create type report_subtype  as enum ('open_manhole','debris','damaged_footpath',
                                     'dug_up_road','speed_breaker','signage','other');
create type report_status   as enum ('open','fixed');
create type vote_kind       as enum ('upvote','flag');

create table cmda_boundary (
  id int primary key default 1 check (id = 1),
  geom geography(MultiPolygon, 4326) not null
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  category report_category not null,
  subtype report_subtype,
  note text check (char_length(note) <= 280),
  location geography(Point, 4326) not null,
  status report_status not null default 'open',
  reporter_id uuid not null references auth.users(id),
  upvote_count int not null default 0,
  flag_count int not null default 0,
  fix_confirm_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fixed_at timestamptz,
  check ((category = 'other') = (subtype is not null))
);
create index on reports using gist (location);
create index on reports (created_at desc);

create table report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('report','fix')),
  blurred boolean not null default true,  -- false if on-device blur failed
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table votes (
  report_id uuid references reports(id) on delete cascade,
  user_id uuid references auth.users(id),
  kind vote_kind not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id, kind)
);

create table fix_confirmations (
  report_id uuid references reports(id) on delete cascade,
  user_id uuid references auth.users(id),
  photo_path text not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table rate_events (
  id bigserial primary key,
  user_id uuid not null,
  ip_hash text,
  action text not null,          -- 'report' | 'comment' | ...
  created_at timestamptz not null default now()
);
create index on rate_events (user_id, action, created_at desc);
create index on rate_events (ip_hash, action, created_at desc);
```

### RPC functions (`security definer`, `search_path = ''`)

| Function | Auth | Purpose |
|---|---|---|
| `create_report(category, subtype, note, lng, lat, photo_paths text[])` | any session | Validate, boundary check, rate-limit, insert report + photos, log rate event. Returns report id. |
| `reports_in_bbox(min_lng, min_lat, max_lng, max_lat, include_fixed bool)` | public | Non-hidden reports in viewport (capped at 2,000). |
| `nearby_reports(lng, lat, category, radius_m default 25)` | public | Open, non-hidden duplicates candidate list. |
| `vote(report_id, kind)` | non-anonymous | Insert vote, bump counter, apply flag-hide threshold. |
| `confirm_fixed(report_id, photo_path)` | non-anonymous | Insert confirmation, apply fixed threshold. |
| `add_comment(report_id, body)` | non-anonymous | Rate-limited comment insert. |
| `merge_anonymous_user(anon_user_id)` | non-anonymous | Re-parent reports after Google sign-in collided with an existing account. |

"Non-anonymous" = `(auth.jwt() ->> 'is_anonymous')::boolean is not true`.

IP hash: the Next.js middleware isn't in the RPC path, so the client IP is read inside
Postgres from `request.headers` (PostgREST exposes `x-forwarded-for` via
`current_setting('request.headers', true)`) and hashed with a server-side salt stored in
Supabase Vault.

### RLS

- `reports`, `report_photos`, `comments`: `select` allowed to `anon`/`authenticated`
  where the parent report is not hidden. No direct `insert/update/delete` policies.
- `votes`, `fix_confirmations`, `push_subscriptions`, `rate_events`: users may read only
  their own rows; writes only via RPC (push subscriptions via a user-scoped insert/delete
  policy).
- Realtime publication includes `reports` only.

### Storage

- Bucket `report-photos` (public read).
- Upload path: `{user_id}/{uuid}.jpg`; policy allows insert only when the first path
  segment equals `auth.uid()`, content-type `image/jpeg`, size ≤ 2 MB.
- RPCs verify every supplied path starts with the caller's uid.

## 6. Application Structure

```
src/
  app/
    page.tsx                 # live map (home)
    report/new/page.tsx      # report flow
    r/[id]/page.tsx          # public report page (SSR + OG)
    me/page.tsx              # my reports
    api/push/report-fixed/route.ts
    manifest.ts              # PWA manifest
  components/
    map/                     # MapView, ReportLayer, PinSheet, Filters
    report/                  # CategoryPicker, PhotoCapture, LocationPicker, DuplicateList
    auth/                    # SessionProvider, GoogleOneTap, SignInPrompt
  lib/
    supabase/                # browser & server clients, generated types
    geo/                     # CMDA bbox constants, bbox helpers
    images/                  # resize, blur (face/plate), encode pipeline
    realtime/                # useReportsChannel hook
    push/                    # web-push subscribe + server send
    i18n/                    # message catalog (en.json)
  sw.ts                      # service worker (push + offline shell)
supabase/
  migrations/                # SQL migrations (schema, RLS, RPC)
  seed.sql                   # CMDA polygon + sample reports
  tests/                     # pgTAP tests
tests/e2e/                   # Playwright
```

Each unit has one job: the image pipeline is a pure function `File → Blob`; map
components know nothing about Supabase beyond the `useReports` hook; all rules are in
SQL.

## 7. Data Flow — Submit to Live Pin

1. Client processes photos → uploads to `report-photos/{uid}/…`.
2. Client calls `rpc('create_report', …)`.
3. Function validates, checks `ST_Covers(cmda.geom, point)`, checks rate windows,
   inserts `reports` + `report_photos` + `rate_events` in one transaction.
4. Postgres WAL → Supabase Realtime → every subscribed client receives `INSERT`.
5. Clients add the pin if it's within the current viewport/filter.

Orphaned photos (uploaded but RPC failed) are removed by a daily `pg_cron` job
deleting storage objects older than 24 h with no `report_photos` row.

## 8. Error Handling

- RPC errors raise with `errcode = 'P0001'` and message = typed code (`OUTSIDE_CMDA`,
  `RATE_LIMITED`, …); the client maps codes to friendly messages from the catalog.
- GPS denied/unavailable → manual pin placement.
- Photo processing failure (model load fails) → fall back to resize+re-encode without
  blur, and store `report_photos.blurred = false` for later review.
- Realtime disconnect → show a "Live updates paused" pill; refetch bbox on reconnect.
- Offline submit → keep draft in IndexedDB and prompt retry when back online (no
  background sync in MVP).

## 9. Privacy & Safety

- EXIF stripped by re-encoding; faces/number plates blurred on-device before upload.
- Raw IPs never stored; only salted hashes, purged after 30 days (`pg_cron`).
- Reporter identity never shown publicly (no names/avatars on reports; comments show
  Google first name only).
- Turnstile on anonymous session creation.

## 10. Testing

- **pgTAP** (`supabase/tests`): boundary accept/reject, rate limits, subtype constraint,
  photo-path ownership, vote uniqueness, flag-hide at 3, fixed at 2, anon cannot vote,
  RLS denies direct writes.
- **Vitest**: image pipeline (dimensions, EXIF gone), error-code mapping, bbox helpers,
  report form validation.
- **Playwright**: browser A submits a report → browser B sees a new pin without reload;
  outside-CMDA location shows the error.
- CI (GitHub Actions): lint, typecheck, Vitest, pgTAP + Playwright against local
  Supabase (Docker).

## 11. Environments & Config

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_MAP_STYLE_URL`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`.
- Local dev: Supabase CLI via `npx supabase` + Docker Desktop, or a hosted dev project.
- Supabase Auth settings: enable anonymous sign-ins, Google provider, Turnstile captcha,
  manual identity linking.

## 12. Open Items (decide during implementation, not blocking)

- ~~Source for the CMDA boundary polygon~~ **Resolved:** fetch the CMDA/Chennai
  Metropolitan Area relation from OpenStreetMap via the Overpass API, simplify it, and
  commit the resulting GeoJSON as a seed fixture (`supabase/seed.sql` / a companion data
  file).
- ~~Specific in-browser blur model~~ **Resolved:** ship with a MediaPipe face detector
  only. No maintained, production-ready client-side license-plate detection library
  exists (checked 2026-09-21 — only small unmaintained YOLO→TFJS repos with no
  accuracy/licensing guarantees, unacceptable for a privacy-critical path). Plate
  detection is a tracked follow-up once a vetted model exists. This still uses the
  spec's own fallback: `report_photos.blurred` reflects per-photo blur success/failure.
- ~~Map tile provider key~~ **Resolved:** MapTiler free tier
  (`NEXT_PUBLIC_MAP_STYLE_URL`). Requires a MapTiler account/API key before production;
  local dev may use MapLibre's shared public demo style key as a placeholder.
- Cloudflare Turnstile also needs a real site key before production; local dev uses
  Cloudflare's published test sitekey (`1x00000000000000000000AA`, always passes).

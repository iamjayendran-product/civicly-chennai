# Citizen Map & Reporting Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working vertical slice of Chennai Road Grievance: a citizen can submit a road-issue report (category, photos with on-device face blur, location) and see it — and everyone else's — appear live on a public map, entirely through Postgres `security definer` RPCs with RLS denying direct writes.

**Architecture:** All validation (CMDA boundary, rate limits, photo ownership) lives in three Postgres RPCs (`create_report`, `reports_in_bbox`, `nearby_reports`) behind RLS-locked tables. The Next.js client never talks to the tables directly — only through `supabase.rpc(...)`. The map loads an initial bbox snapshot via RPC, then a Supabase Realtime channel keeps it live. The report form runs a pure client-side image pipeline (orient → resize → face-blur → re-encode) before uploading to Storage and calling `create_report`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript strict, Supabase (Postgres 17 + PostGIS 3.3, Realtime, Storage, Auth) via `@supabase/supabase-js` + `@supabase/ssr`, MapLibre GL JS, `@mediapipe/tasks-vision` (face detection), Vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-chennai-road-grievance-mvp-design.md` (§4.1 Report an issue, §4.2 Live map, §5 Data Model, §6 Application Structure, §7 Data Flow, §8 Error Handling, §12 Open Items). `CLAUDE.md` and `supabase/CLAUDE.md` and `src/CLAUDE.md` at repo root and subfolders are project-wide conventions and take precedence over anything below if they ever conflict.

## Global Constraints

- All business rules (boundary check, rate limits, dedupe) live in `security definer` Postgres RPC functions in `supabase/migrations/`. Never reimplement or bypass them in Next.js.
- RLS denies all direct `insert`/`update`/`delete` on domain tables (`reports`, `report_photos`, `rate_events`). Writes only via RPC.
- Every RPC: `security definer`, `set search_path = ''`, every identifier fully schema-qualified (`public.reports`, `extensions.st_covers`, `auth.uid()`), explicit `revoke execute ... from public` then `grant execute ... to` the correct roles.
- Geography columns are `extensions.geography(...)`. Build points with `extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography` — **lng first**.
- Boundary check: `extensions.st_covers(cmda_boundary.geom, point)`.
- Errors: `raise exception '<CODE>' using errcode = 'P0001'`. Only these codes exist: `OUTSIDE_CMDA`, `RATE_LIMITED`, `INVALID_PHOTOS`, `INVALID_INPUT`, `AUTH_REQUIRED`. Every code has a matching `errors.<CODE>` key in `src/lib/i18n/messages/en.json`.
- Photo paths passed to RPCs must start with `auth.uid()::text || '/'`.
- Migrations are append-only, named `YYYYMMDDHHMMSS_short_description.sql`. Never edit a committed migration.
- After every migration, run `npm run db:types` and commit the regenerated `src/lib/supabase/database.types.ts`.
- All user-facing strings go through `src/lib/i18n` (`t(key)`); never hard-code UI text in components.
- Map coordinates are always `[lng, lat]` (MapLibre + PostGIS order).
- Server Components by default; `"use client"` only for map, camera, and auth widgets (per `src/CLAUDE.md`).
- `lib/supabase/` is the only place that creates Supabase clients.
- Package manager is npm. Commit messages: imperative mood.
- Local Supabase is already running (`npx supabase start`); `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for `http://127.0.0.1:54321`. Docker's CLI is on `PATH` via `~/.zshrc`.

---

## Out of scope for this slice

Deferred deliberately, not overlooked — each needs its own migration/plan later and is called out here so nobody assumes it's covered:

- `votes`, `fix_confirmations`, `comments`, `push_subscriptions` tables and their RPCs (`vote`, `confirm_fixed`, `add_comment`), and the flag-hide/fix-confirm thresholds (spec §4.4).
- Google identity linking and `merge_anonymous_user` (spec §3).
- The server-rendered `/r/[id]` report page with Open Graph tags (spec §4.3).
- The "My reports" page (spec §4.5).
- Web Push end-to-end (spec §4.6), and the PWA manifest / installability / service worker (`sw.ts`).
- The `pg_cron` jobs for orphaned-photo cleanup and IP-hash purging (spec §7, §9).
- Offline submit with an IndexedDB draft queue (spec §8) — this slice requires connectivity to submit.
- A CI pipeline (GitHub Actions) running lint/typecheck/Vitest/pgTAP/Playwright (spec §10) — out of scope because it's repo infra, not part of this feature; running the same commands locally (see "Final verification" at the end of this plan) is the interim substitute.
- Client-side license-plate detection (see "Verified facts" below) — face blur only for now.

## Verified facts this plan relies on

These were checked against the running local database and real package docs while writing this plan, so implementers don't have to re-derive them:

- Local Postgres is 17.6; PostGIS 3.3 is **not** enabled by default (`create extension` is required). `gen_random_uuid()` is a Postgres 13+ builtin in `pg_catalog` — no extension needed, no schema qualification needed even under `search_path=''`.
- Supabase auto-grants full table privileges (`select/insert/update/delete`) to `anon`/`authenticated` on new `public` tables; RLS is the only real gate. A table with RLS enabled and zero policies for a command returns SQLSTATE `42501`.
- `auth.uid()` reads GUC `request.jwt.claims` (jsonb) `->> 'sub'`; `auth.jwt()` reads the same GUC as jsonb directly. pgTAP tests simulate a session with `set local role authenticated; set local request.jwt.claims = '{"sub":"...","role":"authenticated","is_anonymous":true}';`.
- `vault.create_secret(new_secret, new_name, new_description, new_key_id)` returns `uuid`; `vault.decrypted_secrets` has `name`/`decrypted_secret` columns. `extensions.digest(text, text)` (pgcrypto) is available.
- The `supabase_realtime` publication exists locally with zero tables — `reports` must be added explicitly.
- Storing a `geography` column's raw value flows into Supabase Realtime `postgres_changes` payloads as an EWKB hex string (not parseable client-side without a WKB library). Fix: add `lng`/`lat` as `generated always as (...) stored` double precision columns — verified working locally (`extensions.st_x(location::extensions.geometry)`, `extensions.st_y(...)`, both IMMUTABLE, generated-column-safe).
- The CMDA boundary is OSM relation `12353813` (`boundary=planning_area`, "Chennai metropolitan area"), fetched via Nominatim: single `Polygon`, 1548 points, SRID 4326 already, real area 1204.8 km² (matches CMDA's published ~1189 km²). `extensions.st_simplifypreservetopology(geom, 0.0003)` reduces it to 472 points, area unchanged (1204.9 km²), still valid — this is the tolerance to use.
- No maintained, production-ready client-side license-plate-detection npm package exists (checked 2026-09-21). Only unmaintained YOLO→TFJS repos with no accuracy/licensing guarantees. Per user decision, this slice ships **face blur only** via `@mediapipe/tasks-vision`; plate detection is a tracked follow-up, not part of this plan.
- `@mediapipe/tasks-vision`: `FilesetResolver.forVisionTasks(wasmUrl)` → `FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath }, runningMode: 'IMAGE' })` → `detector.detect(image)`. Model asset URL `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite` returns HTTP 200. `detect()` accepts `ImageSource = TexImageSource` which includes `ImageBitmap` (confirmed against the package's own `vision.d.ts`). Result shape: `{ detections: Array<{ boundingBox?: { originX, originY, width, height, angle }, categories, keypoints }> }`.
- Next.js 16's `cookies()` (from `next/headers`) is async (`await cookies()`), confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` in this repo, per `AGENTS.md`'s instruction to check installed docs rather than training data.
- `jq` is available locally for the boundary-fetch script.

---

## File Structure

```
supabase/
  migrations/
    20260921130000_reports_schema.sql       # extensions, enums, tables, indexes, RLS, realtime publication
    20260921130100_report_photos_storage.sql # storage bucket + policies
    20260921130200_create_report_rpc.sql     # create_report() + vault salt secret
    20260921130300_reports_in_bbox_rpc.sql   # reports_in_bbox()
    20260921130400_nearby_reports_rpc.sql    # nearby_reports()
  seed.sql                                   # CMDA boundary insert (generated block)
  seed-data/
    cmda-boundary.geojson                    # fetched OSM geometry fixture
  tests/
    reports_schema.test.sql
    cmda_boundary.test.sql
    storage.test.sql
    create_report.test.sql
    reports_in_bbox.test.sql
    nearby_reports.test.sql
scripts/
  generate-cmda-seed.mjs                     # regenerates the seed.sql boundary block from the fixture
src/
  lib/
    supabase/
      browser.ts                             # getBrowserClient()
      server.ts                              # getServerClient()
    i18n/
      index.ts                               # t(), errorCodeToMessage()
      messages/en.json
    geo/
      cmda.ts                                # CMDA_BBOX, CMDA_CENTER, CMDA_MAX_BOUNDS, boundsToBboxParams()
      cmda.test.ts
    realtime/
      useReports.ts                          # useReports(bbox, includeFixed) hook
      useReports.test.ts
    images/
      resize.ts                              # computeResizedDimensions() (pure)
      resize.test.ts
      faceBlur.ts                            # detectFaceRegions() (MediaPipe wrapper)
      processPhoto.ts                        # orchestration: orient/resize/blur/encode
      processPhoto.test.ts
    report/
      validation.ts                          # validateReportDraft() (pure)
      validation.test.ts
  components/
    auth/
      SessionProvider.tsx                    # anonymous sign-in + Turnstile bootstrap
      SessionProvider.test.tsx
    map/
      MapView.tsx                            # MapLibre map + clustering
      PinSheet.tsx                           # tap-a-pin detail sheet
      Filters.tsx                            # category chips + show-fixed toggle
    report/
      CategoryPicker.tsx
      PhotoCapture.tsx
      LocationPicker.tsx
      DuplicateList.tsx
  app/
    layout.tsx                               # wraps children in SessionProvider (modified)
    page.tsx                                 # live map (home) (modified)
    report/new/page.tsx                      # report flow (modified)
tests/e2e/
  report-flow.spec.ts
```

Each unit has one job: `lib/images` is pure `File → ProcessedPhoto`, `lib/geo` and `lib/report/validation` are pure functions, `lib/realtime/useReports` is the only thing map components know about Supabase, and every rule that matters lives in SQL.

---

# Part A — Database

## Task 1: Core schema — extensions, enums, tables, indexes, RLS

**Files:**
- Create: `supabase/migrations/20260921130000_reports_schema.sql`
- Test: `supabase/tests/reports_schema.test.sql`

**Interfaces:**
- Produces: tables `public.reports` (`id uuid`, `category public.report_category`, `subtype public.report_subtype`, `note text`, `location extensions.geography(Point,4326)`, `lng float8` generated, `lat float8` generated, `status public.report_status`, `reporter_id uuid`, `upvote_count int`, `flag_count int`, `fix_confirm_count int`, `is_hidden bool`, `created_at`, `updated_at`, `fixed_at`), `public.report_photos`, `public.rate_events`, `public.cmda_boundary` (empty until Task 2). Enums `public.report_category`, `public.report_subtype`, `public.report_status`. `public.reports` is in the `supabase_realtime` publication.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/reports_schema.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- Tables exist
select has_table('public', 'cmda_boundary', 'cmda_boundary table exists');
select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'report_photos', 'report_photos table exists');
select has_table('public', 'rate_events', 'rate_events table exists');

-- RLS is enabled on every domain table
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reports'::regclass),
  'RLS is enabled on reports'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.report_photos'::regclass),
  'RLS is enabled on report_photos'
);

-- The category/subtype pairing check constraint exists and is enforced
select throws_ok(
  $$ insert into public.reports (category, subtype, location, reporter_id)
     values ('pothole', 'debris', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '23514',
  null,
  'a non-other category with a subtype violates the check constraint'
);
select throws_ok(
  $$ insert into public.reports (category, location, reporter_id)
     values ('other', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '23514',
  null,
  'category=other without a subtype violates the check constraint'
);

-- Generated lng/lat columns reflect the point
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, gen_random_uuid());
select ok(
  (select abs(lng - 80.27) < 0.0001 and abs(lat - 13.06) < 0.0001 from public.reports order by created_at desc limit 1),
  'generated lng/lat columns match the inserted point'
);

-- No direct write access for anon or authenticated (RLS denies; no insert/update/delete policy exists)
set local role anon;
select throws_ok(
  $$ insert into public.reports (category, location, reporter_id)
     values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.2, 13.05), 4326)::extensions.geography, gen_random_uuid()) $$,
  '42501',
  null,
  'anon cannot insert directly into reports'
);
reset role;

-- reports is published for Realtime
select ok(
  exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'),
  'reports table is in the supabase_realtime publication'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase test db supabase/tests/reports_schema.test.sql`
Expected: FAIL — `relation "public.cmda_boundary" does not exist` (no migration yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921130000_reports_schema.sql`:

```sql
-- Extensions
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Enums
create type public.report_category as enum ('pothole', 'waterlogging', 'other');
create type public.report_subtype as enum (
  'open_manhole', 'debris', 'damaged_footpath', 'dug_up_road',
  'speed_breaker', 'signage', 'other'
);
create type public.report_status as enum ('open', 'fixed');

-- CMDA boundary (seeded in supabase/seed.sql)
create table public.cmda_boundary (
  id int primary key default 1 check (id = 1),
  geom extensions.geography(MultiPolygon, 4326) not null
);

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  category public.report_category not null,
  subtype public.report_subtype,
  note text check (char_length(note) <= 280),
  location extensions.geography(Point, 4326) not null,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  status public.report_status not null default 'open',
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
create index reports_location_idx on public.reports using gist (location);
create index reports_created_at_idx on public.reports (created_at desc);

-- Report photos
create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('report', 'fix')),
  blurred boolean not null default true,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index report_photos_report_id_idx on public.report_photos (report_id);

-- Rate limiting log (per user and per hashed IP)
create table public.rate_events (
  id bigserial primary key,
  user_id uuid not null,
  ip_hash text,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_user_action_idx on public.rate_events (user_id, action, created_at desc);
create index rate_events_ip_action_idx on public.rate_events (ip_hash, action, created_at desc);

-- RLS: select-only for public data, no direct writes anywhere in this slice.
alter table public.cmda_boundary enable row level security;
create policy "cmda_boundary_select" on public.cmda_boundary for select to anon, authenticated using (true);

alter table public.reports enable row level security;
create policy "reports_select_not_hidden" on public.reports for select to anon, authenticated using (is_hidden = false);

alter table public.report_photos enable row level security;
create policy "report_photos_select_not_hidden" on public.report_photos for select to anon, authenticated using (
  exists (select 1 from public.reports r where r.id = report_photos.report_id and r.is_hidden = false)
);

alter table public.rate_events enable row level security;
-- No policies: rate_events is never read or written directly by anon/authenticated, only by RPCs.

-- Realtime: only reports broadcasts to clients.
alter publication supabase_realtime add table public.reports;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/reports_schema.test.sql`
Expected: PASS — `1..11`, all `ok`.

- [ ] **Step 5: Regenerate types and commit**

Run:
```bash
npm run db:types
git add supabase/migrations/20260921130000_reports_schema.sql supabase/tests/reports_schema.test.sql src/lib/supabase/database.types.ts
git commit -m "Add reports schema: enums, tables, RLS, realtime publication"
```

---

## Task 2: Seed the CMDA boundary

**Files:**
- Create: `supabase/seed-data/cmda-boundary.geojson`
- Create: `scripts/generate-cmda-seed.mjs`
- Modify: `supabase/seed.sql` (create if it doesn't already exist as an empty file)
- Test: `supabase/tests/cmda_boundary.test.sql`

**Interfaces:**
- Consumes: `public.cmda_boundary` table from Task 1.
- Produces: exactly one row in `public.cmda_boundary` with a valid, simplified `MultiPolygon` geography covering the Chennai Metropolitan Area. Every later task that does a boundary check (`create_report`) depends on this row existing after `supabase db reset`.

- [ ] **Step 1: Fetch and commit the raw boundary fixture**

Run:
```bash
mkdir -p supabase/seed-data
curl -s "https://nominatim.openstreetmap.org/lookup?osm_ids=R12353813&format=geojson&polygon_geojson=1" \
  -H "User-Agent: chennai-road-grievance-dev (contact: iamjayendran@gmail.com)" \
  | jq -c '.features[0].geometry' > supabase/seed-data/cmda-boundary.geojson
```

Verify: `jq -r '.type' supabase/seed-data/cmda-boundary.geojson` prints `Polygon`, and `wc -c supabase/seed-data/cmda-boundary.geojson` shows roughly 37KB. This is OSM relation 12353813 ("Chennai metropolitan area", `boundary=planning_area`) — do not swap in a different relation without re-verifying its area is close to 1189 km² (CMDA's published area).

- [ ] **Step 2: Write the failing pgTAP test**

Create `supabase/tests/cmda_boundary.test.sql`:

```sql
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/cmda_boundary.test.sql`
Expected: FAIL — `cmda_boundary has exactly one row` fails, actual count is 0.

- [ ] **Step 4: Write the seed generator script**

Create `scripts/generate-cmda-seed.mjs`:

```js
#!/usr/bin/env node
// Regenerates the CMDA boundary INSERT block inside supabase/seed.sql from the
// committed fixture at supabase/seed-data/cmda-boundary.geojson. Re-run this
// only if the fixture itself changes (e.g. a more accurate boundary source).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repoRoot, 'supabase', 'seed-data', 'cmda-boundary.geojson');
const seedPath = path.join(repoRoot, 'supabase', 'seed.sql');

const START_MARKER = '-- BEGIN generated: cmda boundary (scripts/generate-cmda-seed.mjs)';
const END_MARKER = '-- END generated: cmda boundary';

const geojson = readFileSync(fixturePath, 'utf8').trim();
if (geojson.includes("'")) {
  throw new Error('Unexpected single quote in GeoJSON fixture; escaping logic below assumes none.');
}

const block = [
  START_MARKER,
  'insert into public.cmda_boundary (id, geom) values (',
  '  1,',
  '  extensions.st_multi(extensions.st_simplifypreservetopology(',
  `    extensions.st_geomfromgeojson('${geojson}'),`,
  '    0.0003',
  '  ))::extensions.geography',
  ')',
  'on conflict (id) do update set geom = excluded.geom;',
  END_MARKER,
].join('\n');

const existing = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : '';
const startIdx = existing.indexOf(START_MARKER);
const endIdx = existing.indexOf(END_MARKER);

let next;
if (startIdx !== -1 && endIdx !== -1) {
  next = existing.slice(0, startIdx) + block + existing.slice(endIdx + END_MARKER.length);
} else {
  next = existing.length > 0 ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

writeFileSync(seedPath, next);
console.log(`Wrote CMDA boundary block to ${seedPath}`);
```

- [ ] **Step 5: Run the generator and apply the seed**

Run:
```bash
node scripts/generate-cmda-seed.mjs
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
npx supabase db reset
npx supabase test db supabase/tests/cmda_boundary.test.sql
```
Expected: PASS — `1..4`, all `ok`. (`db reset` re-applies migrations then `seed.sql`, which now contains the generated insert.)

- [ ] **Step 6: Commit**

```bash
git add supabase/seed-data/cmda-boundary.geojson scripts/generate-cmda-seed.mjs supabase/seed.sql supabase/tests/cmda_boundary.test.sql
git commit -m "Seed the CMDA boundary from OSM relation 12353813"
```

---

## Task 3: Storage bucket and photo-path policies

**Files:**
- Create: `supabase/migrations/20260921130100_report_photos_storage.sql`
- Test: `supabase/tests/storage.test.sql`

**Interfaces:**
- Produces: `report-photos` bucket (public read, 2MB limit, `image/jpeg` only) with an insert policy requiring the first path segment to equal `auth.uid()::text`. `create_report` (Task 4) relies on this bucket existing so uploaded paths are valid; `PhotoCapture` (Task 14, frontend) uploads directly to it via the browser Supabase client.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/storage.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(3);

select is(
  (select public from storage.buckets where id = 'report-photos'),
  true,
  'report-photos bucket exists and is public-read'
);

select is(
  (select file_size_limit from storage.buckets where id = 'report-photos'),
  2097152,
  'report-photos bucket enforces a 2MB size limit'
);

select policies_are(
  'storage',
  'objects',
  ARRAY['report_photos_insert_own_path', 'report_photos_public_select']
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/storage.test.sql`
Expected: FAIL — bucket row is null.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921130100_report_photos_storage.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "report_photos_insert_own_path"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "report_photos_public_select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'report-photos');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/storage.test.sql`
Expected: PASS — `1..3`, all `ok`.

- [ ] **Step 5: Regenerate types and commit**

```bash
npm run db:types
git add supabase/migrations/20260921130100_report_photos_storage.sql supabase/tests/storage.test.sql src/lib/supabase/database.types.ts
git commit -m "Add report-photos storage bucket and path-ownership policies"
```

---

## Task 4: `create_report` RPC

**Files:**
- Create: `supabase/migrations/20260921130200_create_report_rpc.sql`
- Test: `supabase/tests/create_report.test.sql`

**Interfaces:**
- Consumes: `public.reports`/`public.report_photos`/`public.rate_events`/`public.cmda_boundary` (Task 1, 2), `report-photos` bucket path convention (Task 3).
- Produces: `public.create_report(p_category public.report_category, p_subtype public.report_subtype, p_note text, p_lng float8, p_lat float8, p_photo_paths text[]) returns uuid`, callable by `anon` and `authenticated`. Raises `OUTSIDE_CMDA`, `RATE_LIMITED`, `INVALID_PHOTOS`, `INVALID_INPUT`, or `AUTH_REQUIRED`. The frontend report flow (Task 14) calls this as the final submit step.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/create_report.test.sql`. This test creates a real `auth.users` row per case (minimal columns needed to satisfy `reports.reporter_id`'s FK and `auth.uid()`), then simulates that session:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- Helper: a point well inside the CMDA boundary (central Chennai).
-- lng=80.27, lat=13.06

-- Fixture user
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', now(), now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":true}';

-- Happy path
select lives_ok(
  $$ select public.create_report('pothole', null, 'Deep pothole near bus stop', 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/a.jpg']) $$,
  'create_report succeeds for a valid pothole report inside the CMDA'
);
select is(
  (select count(*)::int from public.reports where reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report row was inserted'
);
select is(
  (select count(*)::int from public.report_photos rp join public.reports r on r.id = rp.report_id where r.reporter_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exactly one report_photos row was inserted'
);
select is(
  (select count(*)::int from public.rate_events where user_id = '11111111-1111-1111-1111-111111111111' and action = 'report'),
  1,
  'a rate_events row was logged'
);

-- OUTSIDE_CMDA: a point far outside Chennai (Mumbai)
select throws_ok(
  $$ select public.create_report('pothole', null, null, 72.8777, 19.0760, array['11111111-1111-1111-1111-111111111111/b.jpg']) $$,
  'P0001',
  'OUTSIDE_CMDA',
  'a point outside the CMDA raises OUTSIDE_CMDA'
);

-- INVALID_INPUT: category=other without subtype
select throws_ok(
  $$ select public.create_report('other', null, null, 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/c.jpg']) $$,
  'P0001',
  'INVALID_INPUT',
  'category=other without a subtype raises INVALID_INPUT'
);

-- INVALID_PHOTOS: zero photos
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array[]::text[]) $$,
  'P0001',
  'INVALID_PHOTOS',
  'zero photos raises INVALID_PHOTOS'
);

-- INVALID_PHOTOS: a path not owned by the caller
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['22222222-2222-2222-2222-222222222222/d.jpg']) $$,
  'P0001',
  'INVALID_PHOTOS',
  'a photo path not owned by the caller raises INVALID_PHOTOS'
);

-- RATE_LIMITED: six reports within an hour breaches the 5/hour cap
insert into public.rate_events (user_id, action, created_at)
select '11111111-1111-1111-1111-111111111111', 'report', now() - (n || ' minutes')::interval
from generate_series(1, 5) as n;
select throws_ok(
  $$ select public.create_report('pothole', null, null, 80.27, 13.06, array['11111111-1111-1111-1111-111111111111/e.jpg']) $$,
  'P0001',
  'RATE_LIMITED',
  'a 6th report within an hour raises RATE_LIMITED'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/create_report.test.sql`
Expected: FAIL — `function public.create_report(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921130200_create_report_rpc.sql`:

```sql
-- One-time salt for hashing client IPs. Never store raw IPs.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'road_grievance_ip_salt', 'Salt for hashing reporter IP addresses for rate limiting');

create or replace function public.create_report(
  p_category public.report_category,
  p_subtype public.report_subtype,
  p_note text,
  p_lng float8,
  p_lat float8,
  p_photo_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_point extensions.geography;
  v_report_id uuid;
  v_ip text;
  v_salt text;
  v_ip_hash text;
  v_path text;
begin
  v_user_id := (auth.jwt() ->> 'sub')::uuid;
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if (p_category = 'other') <> (p_subtype is not null) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_photo_paths is null or array_length(p_photo_paths, 1) is null
     or array_length(p_photo_paths, 1) < 1 or array_length(p_photo_paths, 1) > 3 then
    raise exception 'INVALID_PHOTOS' using errcode = 'P0001';
  end if;
  foreach v_path in array p_photo_paths loop
    if v_path is null or left(v_path, length(v_user_id::text) + 1) <> (v_user_id::text || '/') then
      raise exception 'INVALID_PHOTOS' using errcode = 'P0001';
    end if;
  end loop;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  if not exists (
    select 1 from public.cmda_boundary cb where extensions.st_covers(cb.geom, v_point)
  ) then
    raise exception 'OUTSIDE_CMDA' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.rate_events
    where user_id = v_user_id and action = 'report' and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.rate_events
    where user_id = v_user_id and action = 'report' and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  v_ip := nullif(trim(v_ip), '');
  if v_ip is not null then
    select decrypted_secret into v_salt from vault.decrypted_secrets where name = 'road_grievance_ip_salt';
    v_ip_hash := encode(extensions.digest(v_ip || v_salt, 'sha256'), 'hex');
    if (
      select count(*) from public.rate_events
      where ip_hash = v_ip_hash and action = 'report' and created_at > now() - interval '1 day'
    ) >= 30 then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.reports (category, subtype, note, location, reporter_id)
  values (p_category, p_subtype, p_note, v_point, v_user_id)
  returning id into v_report_id;

  insert into public.report_photos (report_id, storage_path, kind, uploaded_by)
  select v_report_id, path, 'report', v_user_id
  from unnest(p_photo_paths) as path;

  insert into public.rate_events (user_id, ip_hash, action)
  values (v_user_id, v_ip_hash, 'report');

  return v_report_id;
end;
$$;

revoke execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[]) from public;
grant execute on function public.create_report(public.report_category, public.report_subtype, text, float8, float8, text[]) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/create_report.test.sql`
Expected: PASS — `1..9`, all `ok`.

- [ ] **Step 5: Regenerate types and commit**

```bash
npm run db:types
git add supabase/migrations/20260921130200_create_report_rpc.sql supabase/tests/create_report.test.sql src/lib/supabase/database.types.ts
git commit -m "Add create_report RPC with CMDA check, rate limiting and photo validation"
```

---

## Task 5: `reports_in_bbox` RPC

**Files:**
- Create: `supabase/migrations/20260921130300_reports_in_bbox_rpc.sql`
- Test: `supabase/tests/reports_in_bbox.test.sql`

**Interfaces:**
- Consumes: `public.reports` (Task 1).
- Produces: `public.reports_in_bbox(p_min_lng float8, p_min_lat float8, p_max_lng float8, p_max_lat float8, p_include_fixed boolean default false) returns table (id uuid, category public.report_category, subtype public.report_subtype, note text, lng float8, lat float8, status public.report_status, upvote_count int, created_at timestamptz)`, callable by `anon` and `authenticated`. Consumed by `useReports` (Task 11) for the map's initial load per viewport.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/reports_in_bbox.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

-- Inside the test bbox (80.20-80.30, 13.00-13.10)
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27, 13.06), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333');

-- Outside the test bbox
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.10, 12.90), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333');

-- Inside the bbox but hidden
insert into public.reports (category, location, reporter_id, is_hidden)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.28, 13.07), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333', true);

-- Inside the bbox but fixed
insert into public.reports (category, location, reporter_id, status)
values ('waterlogging', extensions.st_setsrid(extensions.st_makepoint(80.22, 13.02), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333', 'fixed');

select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, false)),
  1,
  'only the one open, non-hidden report inside the bbox is returned by default'
);

select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, true)),
  2,
  'passing include_fixed=true also returns the fixed report inside the bbox'
);

select is(
  (select count(*)::int from public.reports_in_bbox(0, 0, 1, 1, false)),
  0,
  'a bbox with no reports returns zero rows'
);

-- The 2000-row cap
insert into public.reports (category, location, reporter_id)
select 'pothole', extensions.st_setsrid(extensions.st_makepoint(80.25, 13.05), 4326)::extensions.geography, '33333333-3333-3333-3333-333333333333'
from generate_series(1, 2005);
select is(
  (select count(*)::int from public.reports_in_bbox(80.20, 13.00, 80.30, 13.10, false)),
  2000,
  'reports_in_bbox caps results at 2000 rows'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/reports_in_bbox.test.sql`
Expected: FAIL — `function public.reports_in_bbox(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921130300_reports_in_bbox_rpc.sql`:

```sql
create or replace function public.reports_in_bbox(
  p_min_lng float8,
  p_min_lat float8,
  p_max_lng float8,
  p_max_lat float8,
  p_include_fixed boolean default false
)
returns table (
  id uuid,
  category public.report_category,
  subtype public.report_subtype,
  note text,
  lng float8,
  lat float8,
  status public.report_status,
  upvote_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.category, r.subtype, r.note, r.lng, r.lat, r.status, r.upvote_count, r.created_at
  from public.reports r
  where r.is_hidden = false
    and (p_include_fixed or r.status = 'open')
    and extensions.st_intersects(
      r.location,
      extensions.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::extensions.geography
    )
  order by r.created_at desc
  limit 2000;
$$;

revoke execute on function public.reports_in_bbox(float8, float8, float8, float8, boolean) from public;
grant execute on function public.reports_in_bbox(float8, float8, float8, float8, boolean) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/reports_in_bbox.test.sql`
Expected: PASS — `1..4`, all `ok`. (This test seeds 2000+ rows, so it will take a few seconds.)

- [ ] **Step 5: Regenerate types and commit**

```bash
npm run db:types
git add supabase/migrations/20260921130300_reports_in_bbox_rpc.sql supabase/tests/reports_in_bbox.test.sql src/lib/supabase/database.types.ts
git commit -m "Add reports_in_bbox RPC for map viewport loading"
```

---

## Task 6: `nearby_reports` RPC

**Files:**
- Create: `supabase/migrations/20260921130400_nearby_reports_rpc.sql`
- Test: `supabase/tests/nearby_reports.test.sql`

**Interfaces:**
- Consumes: `public.reports` (Task 1).
- Produces: `public.nearby_reports(p_lng float8, p_lat float8, p_category public.report_category, p_radius_m float8 default 25) returns table (id uuid, subtype public.report_subtype, upvote_count int, created_at timestamptz)`, callable by `anon` and `authenticated`. Consumed by `DuplicateList` (Task 14) for the "already reported nearby" step.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/nearby_reports.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

-- ~10m away, same category, open -> candidate
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.27009, 13.06), 4326)::extensions.geography, '44444444-4444-4444-4444-444444444444');

-- ~10m away, different category -> not a candidate
insert into public.reports (category, location, reporter_id)
values ('waterlogging', extensions.st_setsrid(extensions.st_makepoint(80.27009, 13.06), 4326)::extensions.geography, '44444444-4444-4444-4444-444444444444');

-- ~10m away, same category, but fixed -> not a candidate
insert into public.reports (category, location, reporter_id, status)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.26991, 13.06), 4326)::extensions.geography, '44444444-4444-4444-4444-444444444444', 'fixed');

-- Far away (~1km), same category -> not a candidate at the default 25m radius
insert into public.reports (category, location, reporter_id)
values ('pothole', extensions.st_setsrid(extensions.st_makepoint(80.28, 13.06), 4326)::extensions.geography, '44444444-4444-4444-4444-444444444444');

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'pothole')),
  1,
  'only the one open, same-category, in-radius report is returned'
);

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'waterlogging')),
  1,
  'the waterlogging category returns its own matching report'
);

select is(
  (select count(*)::int from public.nearby_reports(80.27, 13.06, 'pothole', 2000)),
  2,
  'widening the radius to 2000m picks up the far-away pothole report too'
);

select is(
  (select count(*)::int from public.nearby_reports(0, 0, 'pothole')),
  0,
  'no reports near an unrelated point'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/nearby_reports.test.sql`
Expected: FAIL — `function public.nearby_reports(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260921130400_nearby_reports_rpc.sql`:

```sql
create or replace function public.nearby_reports(
  p_lng float8,
  p_lat float8,
  p_category public.report_category,
  p_radius_m float8 default 25
)
returns table (
  id uuid,
  subtype public.report_subtype,
  upvote_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.subtype, r.upvote_count, r.created_at
  from public.reports r
  where r.is_hidden = false
    and r.status = 'open'
    and r.category = p_category
    and extensions.st_dwithin(
      r.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_m
    )
  order by r.created_at desc
  limit 20;
$$;

revoke execute on function public.nearby_reports(float8, float8, public.report_category, float8) from public;
grant execute on function public.nearby_reports(float8, float8, public.report_category, float8) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase db reset && npx supabase test db supabase/tests/nearby_reports.test.sql`
Expected: PASS — `1..4`, all `ok`.

- [ ] **Step 5: Run the full pgTAP suite, regenerate types, and commit**

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
npx supabase db reset
npx supabase test db
npm run db:types
git add supabase/migrations/20260921130400_nearby_reports_rpc.sql supabase/tests/nearby_reports.test.sql src/lib/supabase/database.types.ts
git commit -m "Add nearby_reports RPC for duplicate-report detection"
```

Expected: every test file in `supabase/tests/` passes.

---

# Part B — Frontend foundations

## Task 7: Supabase browser/server clients

**Files:**
- Modify: `package.json` (add `@supabase/supabase-js`, `@supabase/ssr`)
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Test: `src/lib/supabase/browser.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`; `src/lib/supabase/database.types.ts` (generated in Part A).
- Produces: `getBrowserClient(): SupabaseClient<Database>` (client components), `getServerClient(): Promise<SupabaseClient<Database>>` (server components/route handlers). Every later task that talks to Supabase imports one of these — never `createClient` directly (per `src/CLAUDE.md`).

- [ ] **Step 1: Install dependencies**

Run: `npm install @supabase/supabase-js @supabase/ssr`

- [ ] **Step 2: Write the failing test**

Create `src/lib/supabase/browser.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

describe('getBrowserClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the same client instance on repeated calls', async () => {
    const { getBrowserClient } = await import('./browser');
    const first = getBrowserClient();
    const second = getBrowserClient();
    expect(first).toBe(second);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/supabase/browser.test.ts`
Expected: FAIL — `Failed to resolve import "./browser"`.

- [ ] **Step 4: Implement the clients**

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
```

Create `src/lib/supabase/server.ts`:

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from './database.types';

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render; middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/supabase/browser.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/lib/supabase/browser.ts src/lib/supabase/server.ts src/lib/supabase/browser.test.ts
git commit -m "Add Supabase browser and server client factories"
```

---

## Task 8: i18n catalog and error-code mapping

**Files:**
- Create: `src/lib/i18n/messages/en.json`
- Create: `src/lib/i18n/index.ts`
- Test: `src/lib/i18n/index.test.ts`

**Interfaces:**
- Produces: `t(key, vars?): string` and `errorCodeToMessage(code: string): string`. Every component in Part C imports strings from here — never hard-coded text.

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { t, errorCodeToMessage } from './index';

describe('t', () => {
  it('returns the English string for a known key', () => {
    expect(t('report.submit')).toBe('Submit report');
  });

  it('interpolates variables', () => {
    expect(t('map.pin.reportedAgo', { time: '2 hours' })).toBe('Reported 2 hours ago');
  });
});

describe('errorCodeToMessage', () => {
  it('maps every known RPC error code to a distinct message', () => {
    const codes = ['OUTSIDE_CMDA', 'RATE_LIMITED', 'INVALID_PHOTOS', 'INVALID_INPUT', 'AUTH_REQUIRED'];
    const messages = codes.map(errorCodeToMessage);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(errorCodeToMessage('SOMETHING_NEW')).toBe(t('errors.UNKNOWN'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/i18n/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Write the message catalog**

Create `src/lib/i18n/messages/en.json`:

```json
{
  "errors.OUTSIDE_CMDA": "This location is outside the Chennai Metropolitan Area. Reports can only be filed within CMDA limits.",
  "errors.RATE_LIMITED": "You've submitted a lot of reports recently. Please try again later.",
  "errors.INVALID_PHOTOS": "Please attach 1 to 3 photos taken just now for this report.",
  "errors.INVALID_INPUT": "Please check the category, subtype and note before submitting.",
  "errors.AUTH_REQUIRED": "Please wait a moment while we set up your session, then try again.",
  "errors.UNKNOWN": "Something went wrong. Please try again.",
  "report.category.pothole": "Pothole",
  "report.category.waterlogging": "Waterlogging",
  "report.category.other": "Other",
  "report.subtype.open_manhole": "Open manhole",
  "report.subtype.debris": "Debris on road",
  "report.subtype.damaged_footpath": "Damaged footpath",
  "report.subtype.dug_up_road": "Dug-up road",
  "report.subtype.speed_breaker": "Unmarked speed breaker",
  "report.subtype.signage": "Missing or damaged signage",
  "report.subtype.other": "Other",
  "report.note.placeholder": "Add a short note (optional)",
  "report.submit": "Submit report",
  "report.submitting": "Submitting…",
  "report.photos.add": "Add photo",
  "report.photos.count": "{{count}} of 3 photos",
  "report.location.useGps": "Use my location",
  "report.location.dragHint": "Drag the pin to the exact spot",
  "report.location.gpsDenied": "Location access was denied. Tap the map to place your pin.",
  "report.duplicates.title": "Already reported nearby",
  "report.duplicates.sameIssue": "Same issue",
  "report.duplicates.signInToConfirm": "Sign in with Google to confirm this is the same issue",
  "report.duplicates.continueAnyway": "None of these — continue",
  "map.filters.allCategories": "All",
  "map.filters.showFixed": "Show fixed",
  "map.status.live": "Live",
  "map.status.paused": "Live updates paused",
  "map.pin.reportedAgo": "Reported {{time}} ago"
}
```

- [ ] **Step 4: Implement `t` and `errorCodeToMessage`**

Create `src/lib/i18n/index.ts`:

```ts
import en from './messages/en.json';

type MessageKey = keyof typeof en;

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let message: string = en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      message = message.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return message;
}

const RPC_ERROR_CODES = ['OUTSIDE_CMDA', 'RATE_LIMITED', 'INVALID_PHOTOS', 'INVALID_INPUT', 'AUTH_REQUIRED'] as const;

export function errorCodeToMessage(code: string): string {
  const known = (RPC_ERROR_CODES as readonly string[]).includes(code);
  return t(known ? (`errors.${code}` as MessageKey) : 'errors.UNKNOWN');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/i18n/index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/
git commit -m "Add i18n message catalog and RPC error-code mapping"
```

---

## Task 9: CMDA geo helpers

**Files:**
- Create: `src/lib/geo/cmda.ts`
- Test: `src/lib/geo/cmda.test.ts`

**Interfaces:**
- Produces: `CMDA_BBOX`, `CMDA_CENTER`, `CMDA_MAX_BOUNDS` (MapLibre `LngLatBoundsLike` tuple), `boundsToBboxParams(bounds): { minLng, minLat, maxLng, maxLat }`. Consumed by `MapView` (Task 13) and `useReports` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `src/lib/geo/cmda.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CMDA_BBOX, CMDA_CENTER, CMDA_MAX_BOUNDS, boundsToBboxParams } from './cmda';

describe('CMDA constants', () => {
  it('CMDA_CENTER sits inside CMDA_BBOX', () => {
    expect(CMDA_CENTER.lng).toBeGreaterThan(CMDA_BBOX.minLng);
    expect(CMDA_CENTER.lng).toBeLessThan(CMDA_BBOX.maxLng);
    expect(CMDA_CENTER.lat).toBeGreaterThan(CMDA_BBOX.minLat);
    expect(CMDA_CENTER.lat).toBeLessThan(CMDA_BBOX.maxLat);
  });

  it('CMDA_MAX_BOUNDS matches [[minLng,minLat],[maxLng,maxLat]]', () => {
    expect(CMDA_MAX_BOUNDS).toEqual([
      [CMDA_BBOX.minLng, CMDA_BBOX.minLat],
      [CMDA_BBOX.maxLng, CMDA_BBOX.maxLat],
    ]);
  });
});

describe('boundsToBboxParams', () => {
  it('maps a MapLibre-like bounds object to RPC params', () => {
    const bounds = {
      getWest: () => 80.2,
      getSouth: () => 13.0,
      getEast: () => 80.3,
      getNorth: () => 13.1,
    };
    expect(boundsToBboxParams(bounds)).toEqual({
      minLng: 80.2,
      minLat: 13.0,
      maxLng: 80.3,
      maxLat: 13.1,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/geo/cmda.test.ts`
Expected: FAIL — `Failed to resolve import "./cmda"`.

- [ ] **Step 3: Implement**

Create `src/lib/geo/cmda.ts`:

```ts
// Matches the OSM relation 12353813 bounding box used to seed public.cmda_boundary
// (see docs/superpowers/plans/2026-09-21-citizen-map-and-reporting.md, Task 2).
export const CMDA_BBOX = {
  minLng: 79.9994028,
  minLat: 12.8503752,
  maxLng: 80.3463295,
  maxLat: 13.2900221,
} as const;

export const CMDA_CENTER = {
  lng: (CMDA_BBOX.minLng + CMDA_BBOX.maxLng) / 2,
  lat: (CMDA_BBOX.minLat + CMDA_BBOX.maxLat) / 2,
} as const;

export const CMDA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [CMDA_BBOX.minLng, CMDA_BBOX.minLat],
  [CMDA_BBOX.maxLng, CMDA_BBOX.maxLat],
];

export interface BoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

export interface BboxParams {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function boundsToBboxParams(bounds: BoundsLike): BboxParams {
  return {
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/geo/cmda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/
git commit -m "Add CMDA bbox constants and bounds-to-RPC-params helper"
```

---

## Task 10: Anonymous session bootstrap with Turnstile

**Files:**
- Create: `src/components/auth/SessionProvider.tsx`
- Test: `src/components/auth/SessionProvider.test.tsx`
- Modify: `src/app/layout.tsx` (wrap children)

**Interfaces:**
- Consumes: `getBrowserClient` (Task 7). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env var (falls back to Cloudflare's published test sitekey `1x00000000000000000000AA` for local dev, which always passes).
- Produces: `<SessionProvider>` wraps the app; exposes `useSession(): { userId: string | null, loading: boolean }` via context. `PhotoCapture`/report submission (Task 14) waits on `loading === false` before allowing submit, since `create_report` requires a session.

- [ ] **Step 1: Install a test dependency for React component tests**

Run: `npm install -D @testing-library/jest-dom`

(`@testing-library/react` and `jsdom` are already installed per `package.json`.)

- [ ] **Step 2: Write the failing test**

Create `src/components/auth/SessionProvider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { user: { id: 'anon-user-1' } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    auth: { signInAnonymously, getSession },
  }),
}));

import { SessionProvider, useSession } from './SessionProvider';

function Probe() {
  const { userId, loading } = useSession();
  if (loading) return <div>loading</div>;
  return <div>user:{userId}</div>;
}

describe('SessionProvider', () => {
  beforeEach(() => {
    signInAnonymously.mockClear();
    getSession.mockClear();
  });

  it('signs in anonymously when there is no existing session, then exposes the user id', async () => {
    render(
      <SessionProvider turnstileToken="test-token">
        <Probe />
      </SessionProvider>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('user:anon-user-1')).toBeInTheDocument());
    expect(signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'test-token' } });
  });
});
```

This test injects the Turnstile token directly (`turnstileToken` prop) rather than rendering the real widget, since the Cloudflare script isn't available in jsdom — the widget-rendering path is covered by the Playwright e2e test in Task 15 instead.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/components/auth/SessionProvider.test.tsx`
Expected: FAIL — `Failed to resolve import "./SessionProvider"`.

- [ ] **Step 4: Implement**

Create `src/components/auth/SessionProvider.tsx`:

```tsx
'use client';

import Script from 'next/script';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

interface SessionState {
  userId: string | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ userId: null, loading: true });

export function useSession() {
  return useContext(SessionContext);
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; size: string; callback: (token: string) => void }) => string;
    };
  }
}

export function SessionProvider({
  children,
  turnstileToken,
}: {
  children: React.ReactNode;
  /** Test-only escape hatch: skips rendering the real Turnstile widget. */
  turnstileToken?: string;
}) {
  const [state, setState] = useState<SessionState>({ userId: null, loading: true });
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  async function bootstrap(captchaToken: string) {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const supabase = getBrowserClient();
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user.id) {
      setState({ userId: existing.session.user.id, loading: false });
      return;
    }
    const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    setState({ userId: error ? null : (data.user?.id ?? null), loading: false });
  }

  useEffect(() => {
    if (turnstileToken) {
      void bootstrap(turnstileToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnstileToken]);

  function handleTurnstileLoad() {
    if (turnstileToken || !widgetContainerRef.current || !window.turnstile) return;
    window.turnstile.render(widgetContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      size: 'invisible',
      callback: (token: string) => void bootstrap(token),
    });
  }

  return (
    <SessionContext.Provider value={state}>
      {!turnstileToken && (
        <>
          <div ref={widgetContainerRef} />
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            onLoad={handleTurnstileLoad}
          />
        </>
      )}
      {children}
    </SessionContext.Provider>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/components/auth/SessionProvider.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire into the root layout**

Read `src/app/layout.tsx` first, then wrap the existing body content in `<SessionProvider>` (add the import and wrap `{children}`; keep everything else in the file unchanged).

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/components/auth/SessionProvider.tsx src/components/auth/SessionProvider.test.tsx src/app/layout.tsx
git commit -m "Add anonymous session bootstrap with Turnstile"
```

---

## Task 11: `useReports` realtime hook

**Files:**
- Create: `src/lib/realtime/useReports.ts`
- Test: `src/lib/realtime/useReports.test.ts`

**Interfaces:**
- Consumes: `getBrowserClient` (Task 7), `Database['public']['Functions']['reports_in_bbox']` return row shape, `BboxParams` (Task 9).
- Produces: `useReports(bbox: BboxParams | null, includeFixed: boolean): { reports: ReportPin[], status: 'loading' | 'live' | 'paused' }`. `MapView` (Task 13) is the only consumer.

- [ ] **Step 1: Write the failing test**

Create `src/lib/realtime/useReports.test.ts`. This mocks the Supabase client's `rpc` and `channel` methods to test the hook's merge logic without a real database:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

let insertHandler: ChangeHandler = () => {};
let updateHandler: ChangeHandler = () => {};

const rpc = vi.fn();
const channel = {
  on: vi.fn(function (this: unknown, _event: string, filter: { event: string }, handler: ChangeHandler) {
    if (filter.event === 'INSERT') insertHandler = handler;
    if (filter.event === 'UPDATE') updateHandler = handler;
    return this;
  }),
  subscribe: vi.fn(function (this: unknown) {
    return this;
  }),
};
const removeChannel = vi.fn();

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    rpc,
    channel: () => channel,
    removeChannel,
  }),
}));

import { useReports } from './useReports';

const bbox = { minLng: 80.2, minLat: 13.0, maxLng: 80.3, maxLat: 13.1 };

describe('useReports', () => {
  beforeEach(() => {
    rpc.mockReset();
    channel.on.mockClear();
    channel.subscribe.mockClear();
  });

  it('loads the initial bbox snapshot from reports_in_bbox', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'r1', category: 'pothole', subtype: null, note: null, lng: 80.25, lat: 13.05, status: 'open', upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useReports(bbox, false));

    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].id).toBe('r1');
    expect(rpc).toHaveBeenCalledWith('reports_in_bbox', {
      p_min_lng: 80.2,
      p_min_lat: 13.0,
      p_max_lng: 80.3,
      p_max_lat: 13.1,
      p_include_fixed: false,
    });
  });

  it('adds a pin from a realtime INSERT event', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReports(bbox, false));
    await waitFor(() => expect(result.current.status).toBe('live'));

    act(() => {
      insertHandler({
        new: { id: 'r2', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', is_hidden: false, upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.reports.map((r) => r.id)).toContain('r2');
  });

  it('removes a pin when a realtime UPDATE marks it hidden', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'r3', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', upvote_count: 0, created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    const { result } = renderHook(() => useReports(bbox, false));
    await waitFor(() => expect(result.current.reports).toHaveLength(1));

    act(() => {
      updateHandler({
        new: { id: 'r3', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', is_hidden: true, upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.reports).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/realtime/useReports.test.ts`
Expected: FAIL — `Failed to resolve import "./useReports"`.

- [ ] **Step 3: Implement**

Create `src/lib/realtime/useReports.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { BboxParams } from '@/lib/geo/cmda';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];
type Subtype = Database['public']['Enums']['report_subtype'];
type Status = Database['public']['Enums']['report_status'];

export interface ReportPin {
  id: string;
  category: Category;
  subtype: Subtype | null;
  note: string | null;
  lng: number;
  lat: number;
  status: Status;
  upvoteCount: number;
  createdAt: string;
}

interface BboxRow {
  id: string;
  category: Category;
  subtype: Subtype | null;
  note: string | null;
  lng: number;
  lat: number;
  status: Status;
  upvote_count: number;
  created_at: string;
}

interface RealtimeReportRow extends BboxRow {
  is_hidden: boolean;
}

function bboxRowToPin(row: BboxRow): ReportPin {
  return {
    id: row.id,
    category: row.category,
    subtype: row.subtype,
    note: row.note,
    lng: row.lng,
    lat: row.lat,
    status: row.status,
    upvoteCount: row.upvote_count,
    createdAt: row.created_at,
  };
}

function isWithinBbox(pin: ReportPin, bbox: BboxParams): boolean {
  return pin.lng >= bbox.minLng && pin.lng <= bbox.maxLng && pin.lat >= bbox.minLat && pin.lat <= bbox.maxLat;
}

export function useReports(bbox: BboxParams | null, includeFixed: boolean) {
  const [reports, setReports] = useState<Map<string, ReportPin>>(new Map());
  const [status, setStatus] = useState<'loading' | 'live' | 'paused'>('loading');

  useEffect(() => {
    if (!bbox) return;
    const supabase = getBrowserClient();
    let cancelled = false;
    setStatus('loading');

    supabase
      .rpc('reports_in_bbox', {
        p_min_lng: bbox.minLng,
        p_min_lat: bbox.minLat,
        p_max_lng: bbox.maxLng,
        p_max_lat: bbox.maxLat,
        p_include_fixed: includeFixed,
      })
      .then(({ data, error }: { data: BboxRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          setStatus('paused');
          return;
        }
        setReports(new Map((data ?? []).map((row) => [row.id, bboxRowToPin(row)])));
        setStatus('live');
      });

    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload: { new: RealtimeReportRow }) => {
        const row = payload.new;
        if (row.is_hidden || (!includeFixed && row.status === 'fixed')) return;
        const pin = bboxRowToPin(row);
        if (!isWithinBbox(pin, bbox)) return;
        setReports((prev) => new Map(prev).set(pin.id, pin));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, (payload: { new: RealtimeReportRow }) => {
        const row = payload.new;
        const pin = bboxRowToPin(row);
        setReports((prev) => {
          const next = new Map(prev);
          const shouldShow = !row.is_hidden && (includeFixed || row.status === 'open') && isWithinBbox(pin, bbox);
          if (shouldShow) {
            next.set(pin.id, pin);
          } else {
            next.delete(pin.id);
          }
          return next;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, includeFixed, bbox]);

  return { reports: Array.from(reports.values()), status };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/realtime/useReports.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/realtime/
git commit -m "Add useReports bbox+realtime hook"
```

---

## Task 12: Client-side image pipeline (resize, face blur, re-encode)

**Files:**
- Create: `src/lib/images/resize.ts`
- Test: `src/lib/images/resize.test.ts`
- Create: `src/lib/images/faceBlur.ts`
- Create: `src/lib/images/processPhoto.ts`
- Test: `src/lib/images/processPhoto.test.ts`

**Interfaces:**
- Produces: `computeResizedDimensions(width, height, maxLongEdge?): { width, height }` (pure), `detectFaceRegions(image: ImageBitmap): Promise<BlurRegion[]>`, `processPhoto(file: File | Blob): Promise<{ blob: Blob; blurred: boolean; width: number; height: number }>`. `PhotoCapture` (Task 14) is the only consumer of `processPhoto`.

- [ ] **Step 1: Install the face-detection package**

Run: `npm install @mediapipe/tasks-vision`

- [ ] **Step 2: Write the failing test for the pure resize helper**

Create `src/lib/images/resize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeResizedDimensions, MAX_LONG_EDGE } from './resize';

describe('computeResizedDimensions', () => {
  it('leaves an image alone if its long edge is already within the max', () => {
    expect(computeResizedDimensions(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('scales a landscape image down so its long edge is exactly the max', () => {
    expect(computeResizedDimensions(3200, 2400)).toEqual({ width: MAX_LONG_EDGE, height: 1200 });
  });

  it('scales a portrait image down so its long edge is exactly the max', () => {
    expect(computeResizedDimensions(2400, 3200)).toEqual({ width: 1200, height: MAX_LONG_EDGE });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/images/resize.test.ts`
Expected: FAIL — `Failed to resolve import "./resize"`.

- [ ] **Step 4: Implement the pure resize helper**

Create `src/lib/images/resize.ts`:

```ts
export const MAX_LONG_EDGE = 1600;

export function computeResizedDimensions(
  width: number,
  height: number,
  maxLongEdge: number = MAX_LONG_EDGE
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/images/resize.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement the face-detection wrapper**

Create `src/lib/images/faceBlur.ts`:

```ts
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise: Promise<FaceDetector> | null = null;

async function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).then((vision) =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
        runningMode: 'IMAGE',
      })
    );
  }
  return detectorPromise;
}

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectFaceRegions(image: ImageBitmap): Promise<BlurRegion[]> {
  const detector = await getFaceDetector();
  const result = detector.detect(image);
  return result.detections
    .filter((detection) => detection.boundingBox)
    .map((detection) => ({
      x: detection.boundingBox!.originX,
      y: detection.boundingBox!.originY,
      width: detection.boundingBox!.width,
      height: detection.boundingBox!.height,
    }));
}
```

- [ ] **Step 7: Write the failing test for the orchestration function**

Create `src/lib/images/processPhoto.test.ts`. This mocks `faceBlur` and the browser's canvas APIs (not implemented by jsdom) so the test exercises the pipeline's logic and error handling, not real image decoding:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./faceBlur', () => ({
  detectFaceRegions: vi.fn().mockResolvedValue([]),
}));

class FakeCanvasContext {
  canvas: FakeOffscreenCanvas;
  filter = 'none';
  constructor(canvas: FakeOffscreenCanvas) {
    this.canvas = canvas;
  }
  drawImage = vi.fn();
  save = vi.fn();
  restore = vi.fn();
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return new FakeCanvasContext(this);
  }
  convertToBlob({ type }: { type: string; quality: number }) {
    return Promise.resolve(new Blob(['fake-bytes'], { type }));
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 3200, height: 2400, close: vi.fn() })
  );
});

describe('processPhoto', () => {
  it('resizes to fit within the 1600px long edge and re-encodes as JPEG', async () => {
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blurred).toBe(true);
  });

  it('sets blurred:false without throwing when face detection fails', async () => {
    const { detectFaceRegions } = await import('./faceBlur');
    vi.mocked(detectFaceRegions).mockRejectedValueOnce(new Error('model failed to load'));
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));
    expect(result.blurred).toBe(false);
    expect(result.blob).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- src/lib/images/processPhoto.test.ts`
Expected: FAIL — `Failed to resolve import "./processPhoto"`.

- [ ] **Step 9: Implement the orchestration function**

Create `src/lib/images/processPhoto.ts`:

```ts
import { computeResizedDimensions } from './resize';
import { detectFaceRegions, type BlurRegion } from './faceBlur';

export interface ProcessedPhoto {
  blob: Blob;
  /** false if face detection failed and the photo was uploaded unblurred. */
  blurred: boolean;
  width: number;
  height: number;
}

const JPEG_QUALITY = 0.8;
const BLUR_PADDING_RATIO = 0.25;
const BLUR_PIXELS = 12;

export async function processPhoto(file: File | Blob): Promise<ProcessedPhoto> {
  const oriented = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = computeResizedDimensions(oriented.width, oriented.height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('2D canvas context is unavailable in this browser');
  }
  ctx.drawImage(oriented, 0, 0, width, height);
  oriented.close();

  let blurred = true;
  try {
    const resizedBitmap = await createImageBitmap(canvas as unknown as ImageBitmapSource);
    const regions = await detectFaceRegions(resizedBitmap);
    for (const region of regions) {
      blurRegion(ctx, region);
    }
  } catch {
    blurred = false;
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return { blob, blurred, width, height };
}

function blurRegion(ctx: OffscreenCanvasRenderingContext2D, region: BlurRegion) {
  const padding = Math.round(Math.max(region.width, region.height) * BLUR_PADDING_RATIO);
  const x = Math.max(0, Math.round(region.x - padding));
  const y = Math.max(0, Math.round(region.y - padding));
  const w = Math.min(ctx.canvas.width - x, Math.round(region.width + padding * 2));
  const h = Math.min(ctx.canvas.height - y, Math.round(region.height + padding * 2));
  if (w <= 0 || h <= 0) return;

  const patch = new OffscreenCanvas(w, h);
  const patchCtx = patch.getContext('2d');
  if (!patchCtx) return;
  patchCtx.filter = `blur(${BLUR_PIXELS}px)`;
  patchCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
  ctx.drawImage(patch, x, y);
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- src/lib/images/processPhoto.test.ts`
Expected: PASS.

- [ ] **Step 11: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/lib/images/
git commit -m "Add client-side photo pipeline: resize, face blur, JPEG re-encode"
```

---

## Task 13: Report-form validation (pure)

**Files:**
- Create: `src/lib/report/validation.ts`
- Test: `src/lib/report/validation.test.ts`

**Interfaces:**
- Produces: `validateReportDraft(draft: ReportDraft): ReportDraftError[]`. `CategoryPicker`/report page (Task 14) uses this for instant client-side feedback; it never replaces the server-side checks in `create_report`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/report/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateReportDraft, type ReportDraft } from './validation';

const validDraft: ReportDraft = {
  category: 'pothole',
  subtype: null,
  note: '',
  photoCount: 1,
  hasLocation: true,
};

describe('validateReportDraft', () => {
  it('returns no errors for a valid pothole draft', () => {
    expect(validateReportDraft(validDraft)).toEqual([]);
  });

  it('requires a subtype when category is other', () => {
    expect(validateReportDraft({ ...validDraft, category: 'other', subtype: null })).toContain('SUBTYPE_REQUIRED');
  });

  it('rejects a note over 280 characters', () => {
    expect(validateReportDraft({ ...validDraft, note: 'x'.repeat(281) })).toContain('NOTE_TOO_LONG');
  });

  it('requires at least one photo', () => {
    expect(validateReportDraft({ ...validDraft, photoCount: 0 })).toContain('PHOTOS_REQUIRED');
  });

  it('rejects more than three photos', () => {
    expect(validateReportDraft({ ...validDraft, photoCount: 4 })).toContain('TOO_MANY_PHOTOS');
  });

  it('requires a location', () => {
    expect(validateReportDraft({ ...validDraft, hasLocation: false })).toContain('LOCATION_REQUIRED');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/report/validation.test.ts`
Expected: FAIL — `Failed to resolve import "./validation"`.

- [ ] **Step 3: Implement**

Create `src/lib/report/validation.ts`:

```ts
export type ReportCategory = 'pothole' | 'waterlogging' | 'other';
export type ReportSubtype =
  | 'open_manhole'
  | 'debris'
  | 'damaged_footpath'
  | 'dug_up_road'
  | 'speed_breaker'
  | 'signage'
  | 'other';

export interface ReportDraft {
  category: ReportCategory;
  subtype: ReportSubtype | null;
  note: string;
  photoCount: number;
  hasLocation: boolean;
}

export type ReportDraftError =
  | 'SUBTYPE_REQUIRED'
  | 'NOTE_TOO_LONG'
  | 'PHOTOS_REQUIRED'
  | 'TOO_MANY_PHOTOS'
  | 'LOCATION_REQUIRED';

const MAX_NOTE_LENGTH = 280;
const MAX_PHOTOS = 3;

export function validateReportDraft(draft: ReportDraft): ReportDraftError[] {
  const errors: ReportDraftError[] = [];

  if (draft.category === 'other' && draft.subtype === null) {
    errors.push('SUBTYPE_REQUIRED');
  }
  if (draft.note.length > MAX_NOTE_LENGTH) {
    errors.push('NOTE_TOO_LONG');
  }
  if (draft.photoCount < 1) {
    errors.push('PHOTOS_REQUIRED');
  } else if (draft.photoCount > MAX_PHOTOS) {
    errors.push('TOO_MANY_PHOTOS');
  }
  if (!draft.hasLocation) {
    errors.push('LOCATION_REQUIRED');
  }

  return errors;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/report/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/
git commit -m "Add pure report-draft validation for client-side feedback"
```

---

# Part C — UI

## Task 14: Live map view

**Files:**
- Create: `src/components/map/MapView.tsx`
- Create: `src/components/map/PinSheet.tsx`
- Create: `src/components/map/Filters.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useReports` (Task 11), `CMDA_CENTER`/`CMDA_MAX_BOUNDS`/`boundsToBboxParams` (Task 9), `t` (Task 8).
- Produces: the home page live map. No further tasks in this slice depend on this one; it is covered by the Playwright e2e test (Task 15), not Vitest, per the spec's own testing split (§10 lists Vitest for the pure helpers/pipeline only).

- [ ] **Step 1: Install MapLibre**

Run: `npm install maplibre-gl`

- [ ] **Step 2: Implement `Filters`**

Create `src/components/map/Filters.tsx`:

```tsx
'use client';

import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];

const CATEGORIES: Category[] = ['pothole', 'waterlogging', 'other'];

export interface FiltersProps {
  selectedCategory: Category | null;
  onSelectCategory: (category: Category | null) => void;
  showFixed: boolean;
  onToggleShowFixed: (value: boolean) => void;
}

export function Filters({ selectedCategory, onSelectCategory, showFixed, onToggleShowFixed }: FiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto p-3">
      <Chip active={selectedCategory === null} onClick={() => onSelectCategory(null)} label={t('map.filters.allCategories')} />
      {CATEGORIES.map((category) => (
        <Chip
          key={category}
          active={selectedCategory === category}
          onClick={() => onSelectCategory(category)}
          label={t(`report.category.${category}`)}
        />
      ))}
      <Chip active={showFixed} onClick={() => onToggleShowFixed(!showFixed)} label={t('map.filters.showFixed')} />
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-800'}`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Implement `PinSheet`**

Create `src/components/map/PinSheet.tsx`:

```tsx
'use client';

import { t } from '@/lib/i18n';
import type { ReportPin } from '@/lib/realtime/useReports';

export interface PinSheetProps {
  report: ReportPin;
  onClose: () => void;
}

export function PinSheet({ report, onClose }: PinSheetProps) {
  const categoryLabel = t(`report.category.${report.category}`);
  const subtypeLabel = report.subtype ? t(`report.subtype.${report.subtype}`) : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-4 shadow-lg">
      <button type="button" onClick={onClose} className="mb-2 text-sm text-gray-500">
        ✕
      </button>
      <h2 className="text-lg font-semibold">{subtypeLabel ?? categoryLabel}</h2>
      {report.note && <p className="mt-1 text-sm text-gray-700">{report.note}</p>}
      <p className="mt-2 text-xs text-gray-500">
        {report.status === 'fixed' ? 'Fixed' : 'Open'} · {report.upvoteCount} +1
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `MapView`**

Create `src/components/map/MapView.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER, CMDA_MAX_BOUNDS, boundsToBboxParams } from '@/lib/geo/cmda';
import { useReports, type ReportPin } from '@/lib/realtime/useReports';
import { Filters } from './Filters';
import { PinSheet } from './PinSheet';
import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];

const DEFAULT_MAP_STYLE_URL = 'https://api.maptiler.com/maps/streets-v2/style.json?key=get_your_own_OpKXcHfvzZbdqZoLD5wf';
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

const SOURCE_ID = 'reports';
const CLUSTER_LAYER_ID = 'reports-clusters';
const CLUSTER_COUNT_LAYER_ID = 'reports-cluster-count';
const UNCLUSTERED_LAYER_ID = 'reports-unclustered';

function reportsToGeoJson(reports: ReportPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reports.map((report) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [report.lng, report.lat] },
      properties: { id: report.id, status: report.status },
    })),
  };
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const reportsRef = useRef<ReportPin[]>([]);
  const [bbox, setBbox] = useState<ReturnType<typeof boundsToBboxParams> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportPin | null>(null);

  const { reports, status } = useReports(bbox, showFixed);
  const visibleReports = selectedCategory ? reports.filter((r) => r.category === selectedCategory) : reports;
  reportsRef.current = visibleReports;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 10,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;

    function updateBboxFromMap() {
      setBbox(boundsToBboxParams(map.getBounds()));
    }

    map.on('load', () => {
      updateBboxFromMap();
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: reportsToGeoJson(reportsRef.current),
        cluster: true,
        clusterRadius: 40,
      });
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#dc2626',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'status'], 'fixed', '#9ca3af', '#dc2626'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', UNCLUSTERED_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        const report = id ? reportsRef.current.find((r) => r.id === id) : undefined;
        if (report) setSelectedReport(report);
      });

      map.on('click', CLUSTER_LAYER_ID, (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        const geometry = feature?.geometry;
        if (clusterId === undefined || geometry?.type !== 'Point') return;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom });
        });
      });
    });

    map.on('moveend', updateBboxFromMap);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) return;
    (map.getSource(SOURCE_ID) as GeoJSONSource).setData(reportsToGeoJson(visibleReports));
  }, [visibleReports]);

  return (
    <div className="relative h-dvh w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-0 w-full bg-white/90">
        <Filters
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          showFixed={showFixed}
          onToggleShowFixed={setShowFixed}
        />
      </div>
      {status === 'paused' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/80 px-3 py-1 text-xs text-white">
          {t('map.status.paused')}
        </div>
      )}
      {selectedReport && <PinSheet report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Wire into the home page**

Read `src/app/page.tsx` first, then replace its content so the page renders `<MapView />` as a client component (add `import { MapView } from '@/components/map/MapView';` and render it; since `MapView` is itself `"use client"`, `page.tsx` can remain a Server Component that simply renders it).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (MapLibre ships its own TypeScript types; no `@types` package needed.)

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000`, and confirm the map renders centered on Chennai, bounded to the CMDA extent (panning stops at the edges), with the filter chips visible. If `NEXT_PUBLIC_MAP_STYLE_URL` is unset in `.env.local`, the map uses MapLibre's shared public demo style key — ask the user for a real MapTiler key before this ships past local dev.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/map/ src/app/page.tsx
git commit -m "Add live map view with clustering, category filters and pin sheet"
```

---

## Task 15: Report submission flow

**Files:**
- Create: `src/components/report/CategoryPicker.tsx`
- Create: `src/components/report/PhotoCapture.tsx`
- Create: `src/components/report/LocationPicker.tsx`
- Create: `src/components/report/DuplicateList.tsx`
- Modify: `src/app/report/new/page.tsx`

**Interfaces:**
- Consumes: `validateReportDraft` (Task 13), `processPhoto` (Task 12), `getBrowserClient` (Task 7), `useSession` (Task 10), `t`/`errorCodeToMessage` (Task 8), `CMDA_MAX_BOUNDS`/`CMDA_CENTER` (Task 9), the `create_report`/`nearby_reports` RPCs (Tasks 4, 6), the `report-photos` bucket (Task 3).
- Produces: the `/report/new` page. Covered by the Playwright e2e test (Task 16), consistent with the spec's testing split.

- [ ] **Step 1: Implement `CategoryPicker`**

Create `src/components/report/CategoryPicker.tsx`:

```tsx
'use client';

import { t } from '@/lib/i18n';
import type { ReportCategory, ReportSubtype } from '@/lib/report/validation';

const CATEGORIES: ReportCategory[] = ['pothole', 'waterlogging', 'other'];
const SUBTYPES: ReportSubtype[] = [
  'open_manhole', 'debris', 'damaged_footpath', 'dug_up_road', 'speed_breaker', 'signage', 'other',
];

export interface CategoryPickerProps {
  category: ReportCategory;
  subtype: ReportSubtype | null;
  onChangeCategory: (category: ReportCategory) => void;
  onChangeSubtype: (subtype: ReportSubtype) => void;
}

export function CategoryPicker({ category, subtype, onChangeCategory, onChangeSubtype }: CategoryPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangeCategory(value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              category === value ? 'border-red-600 bg-red-50 font-medium' : 'border-gray-300'
            }`}
          >
            {t(`report.category.${value}`)}
          </button>
        ))}
      </div>
      {category === 'other' && (
        <select
          value={subtype ?? ''}
          onChange={(event) => onChangeSubtype(event.target.value as ReportSubtype)}
          className="rounded-lg border border-gray-300 p-2 text-sm"
        >
          <option value="" disabled>
            {t('report.category.other')}
          </option>
          {SUBTYPES.map((value) => (
            <option key={value} value={value}>
              {t(`report.subtype.${value}`)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `PhotoCapture`**

Create `src/components/report/PhotoCapture.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { t } from '@/lib/i18n';
import { processPhoto } from '@/lib/images/processPhoto';

export interface CapturedPhoto {
  blob: Blob;
  blurred: boolean;
  previewUrl: string;
}

export interface PhotoCaptureProps {
  photos: CapturedPhoto[];
  onChange: (photos: CapturedPhoto[]) => void;
  max?: number;
}

export function PhotoCapture({ photos, onChange, max = 3 }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = max - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const processed = await Promise.all(
      toProcess.map(async (file) => {
        const { blob, blurred } = await processPhoto(file);
        return { blob, blurred, previewUrl: URL.createObjectURL(blob) };
      })
    );
    onChange([...photos, ...processed]);
  }

  function removeAt(index: number) {
    const next = photos.slice();
    const [removed] = next.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onChange(next);
  }

  return (
    <div>
      <div className="flex gap-2">
        {photos.map((photo, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div key={photo.previewUrl} className="relative">
            <img src={photo.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute -right-1 -top-1 rounded-full bg-gray-900 text-xs text-white"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500"
          >
            {t('report.photos.add')}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t('report.photos.count', { count: photos.length })}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement `LocationPicker`**

Create `src/components/report/LocationPicker.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER, CMDA_MAX_BOUNDS } from '@/lib/geo/cmda';
import { t } from '@/lib/i18n';

const DEFAULT_MAP_STYLE_URL = 'https://api.maptiler.com/maps/streets-v2/style.json?key=get_your_own_OpKXcHfvzZbdqZoLD5wf';
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

export interface LocationPickerProps {
  onChange: (location: { lng: number; lat: number }) => void;
}

export function LocationPicker({ onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let marker: Marker;
    const map: MapLibreMap = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 12,
      maxBounds: CMDA_MAX_BOUNDS,
    });

    function setLocation(lng: number, lat: number) {
      marker.setLngLat([lng, lat]);
      onChange({ lng, lat });
    }

    map.on('load', () => {
      marker = new maplibregl.Marker({ draggable: true }).setLngLat([CMDA_CENTER.lng, CMDA_CENTER.lat]).addTo(map);
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        setLocation(lng, lat);
      });
      map.on('click', (event) => setLocation(event.lngLat.lng, event.lngLat.lat));

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { longitude, latitude } = position.coords;
            map.setCenter([longitude, latitude]);
            setLocation(longitude, latitude);
          },
          () => setGpsDenied(true)
        );
      } else {
        setGpsDenied(true);
      }
    });

    return () => map.remove();
  }, [onChange]);

  return (
    <div>
      <div ref={containerRef} className="h-64 w-full rounded-lg" />
      <p className="mt-1 text-xs text-gray-500">{gpsDenied ? t('report.location.gpsDenied') : t('report.location.dragHint')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `DuplicateList`**

Create `src/components/report/DuplicateList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';
import type { ReportCategory } from '@/lib/report/validation';

interface Candidate {
  id: string;
  created_at: string;
  upvote_count: number;
}

export interface DuplicateListProps {
  lng: number;
  lat: number;
  category: ReportCategory;
  onContinue: () => void;
}

export function DuplicateList({ lng, lat, category, onContinue }: DuplicateListProps) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBrowserClient()
      .rpc('nearby_reports', { p_lng: lng, p_lat: lat, p_category: category })
      .then(({ data }: { data: Candidate[] | null }) => {
        if (!cancelled) setCandidates(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [lng, lat, category]);

  if (candidates === null) return null;
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h3 className="text-sm font-medium">{t('report.duplicates.title')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between text-sm">
            <span>{candidate.upvote_count} +1</span>
            <span className="text-xs text-gray-500">{t('report.duplicates.signInToConfirm')}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onContinue} className="mt-2 text-sm text-red-600">
        {t('report.duplicates.continueAnyway')}
      </button>
    </div>
  );
}
```

(Selecting "Same issue" +1's an existing report, which requires a non-anonymous, Google-linked user — out of scope for this slice per the plan's deferred list. This component only surfaces candidates and a sign-in prompt; the vote RPC lands in the community-lifecycle slice.)

- [ ] **Step 5: Wire the report page**

Read `src/app/report/new/page.tsx` first, then replace its content with the orchestrating client component:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CategoryPicker } from '@/components/report/CategoryPicker';
import { PhotoCapture, type CapturedPhoto } from '@/components/report/PhotoCapture';
import { LocationPicker } from '@/components/report/LocationPicker';
import { DuplicateList } from '@/components/report/DuplicateList';
import { validateReportDraft, type ReportCategory, type ReportSubtype } from '@/lib/report/validation';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSession } from '@/components/auth/SessionProvider';
import { t, errorCodeToMessage } from '@/lib/i18n';

export default function NewReportPage() {
  const router = useRouter();
  const { userId, loading: sessionLoading } = useSession();
  const [category, setCategory] = useState<ReportCategory>('pothole');
  const [subtype, setSubtype] = useState<ReportSubtype | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [confirmedNotDuplicate, setConfirmedNotDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draftErrors = useMemo(
    () =>
      validateReportDraft({
        category,
        subtype,
        note,
        photoCount: photos.length,
        hasLocation: location !== null,
      }),
    [category, subtype, note, photos.length, location]
  );

  async function handleSubmit() {
    if (draftErrors.length > 0 || !location || !userId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = getBrowserClient();
      const photoPaths = await Promise.all(
        photos.map(async (photo, index) => {
          const path = `${userId}/${crypto.randomUUID()}-${index}.jpg`;
          const { error } = await supabase.storage.from('report-photos').upload(path, photo.blob, {
            contentType: 'image/jpeg',
          });
          if (error) throw error;
          return path;
        })
      );

      const { data: reportId, error } = await supabase.rpc('create_report', {
        p_category: category,
        p_subtype: category === 'other' ? subtype : null,
        p_note: note || null,
        p_lng: location.lng,
        p_lat: location.lat,
        p_photo_paths: photoPaths,
      });

      if (error) {
        setErrorMessage(errorCodeToMessage(error.message));
        return;
      }

      router.push(`/r/${reportId}`);
    } catch {
      setErrorMessage(errorCodeToMessage('UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <CategoryPicker category={category} subtype={subtype} onChangeCategory={setCategory} onChangeSubtype={setSubtype} />
      <PhotoCapture photos={photos} onChange={setPhotos} />
      <LocationPicker onChange={setLocation} />
      {location && !confirmedNotDuplicate && (
        <DuplicateList lng={location.lng} lat={location.lat} category={category} onContinue={() => setConfirmedNotDuplicate(true)} />
      )}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('report.note.placeholder')}
        maxLength={280}
        className="rounded-lg border border-gray-300 p-2 text-sm"
      />
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={draftErrors.length > 0 || submitting || sessionLoading}
        className="rounded-lg bg-red-600 py-3 text-center font-medium text-white disabled:opacity-50"
      >
        {submitting ? t('report.submitting') : t('report.submit')}
      </button>
    </main>
  );
}
```

Note: `error.message` from a PostgREST RPC error carries the RPC's raised message text — for our functions that is exactly the typed code string (e.g. `"OUTSIDE_CMDA"`), which `errorCodeToMessage` maps to a friendly string.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000/report/new`, and walk through: pick a category, add a photo (confirm it appears as a thumbnail), place a pin via GPS or tap, submit, and confirm you land on `/r/<id>` (that page doesn't exist yet in this slice — a 404 there is expected and fine; the point is `create_report` succeeded). Also test submitting from a location outside the CMDA (e.g. drag the map far away) and confirm the `OUTSIDE_CMDA` message renders.

- [ ] **Step 8: Commit**

```bash
git add src/components/report/ src/app/report/new/page.tsx
git commit -m "Add report submission flow: category, photos, location, duplicates"
```

---

## Task 16: End-to-end tests

**Files:**
- Create: `tests/e2e/report-flow.spec.ts`
- Modify: `playwright.config.ts` (only if it doesn't already point at `http://localhost:3000` and run `npm run dev` — read it first before changing anything)

**Interfaces:**
- Consumes: the full stack from Tasks 1–15 running together (local Supabase + `npm run dev`).

- [ ] **Step 1: Read the existing Playwright config**

Read `playwright.config.ts` to confirm its `baseURL` and `webServer` settings before writing tests against it. Only modify it if it does not already start `npm run dev` and target `http://localhost:3000` — if it needs changes, add exactly that `webServer` block without altering unrelated config.

- [ ] **Step 2: Write the failing e2e test**

Create `tests/e2e/report-flow.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

async function submitReport(page: Page, { lng, lat }: { lng: number; lat: number }) {
  await page.goto('/report/new');
  await page.getByRole('button', { name: 'Pothole' }).click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'pothole.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
      'base64'
    ),
  });
  await page.getByText('1 of 3 photos').waitFor();

  const map = page.locator('.maplibregl-canvas').first();
  const box = await map.boundingBox();
  if (!box) throw new Error('map canvas not found');
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  void lng;
  void lat;

  await page.getByRole('button', { name: 'Submit report' }).click();
}

test('a report appears live on a second browser without reload', async ({ browser }) => {
  const reporterContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();

  await viewerPage.goto('/');
  await viewerPage.waitForSelector('.maplibregl-canvas');
  const pinsBefore = await viewerPage.locator('.maplibregl-canvas').first().screenshot();

  await submitReport(reporterPage, { lng: 80.27, lat: 13.06 });
  await expect(reporterPage).toHaveURL(/\/r\//);

  await expect
    .poll(async () => (await viewerPage.locator('.maplibregl-canvas').first().screenshot()).equals(pinsBefore), {
      timeout: 10_000,
    })
    .toBe(false);

  await reporterContext.close();
  await viewerContext.close();
});

test('submitting outside the CMDA shows the OUTSIDE_CMDA error', async ({ page }) => {
  await page.goto('/report/new');
  await page.getByRole('button', { name: 'Pothole' }).click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'pothole.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
      'base64'
    ),
  });
  await page.getByText('1 of 3 photos').waitFor();

  // Pan the location picker map far outside the CMDA before clicking to drop the pin.
  const map = page.locator('.maplibregl-canvas').nth(1);
  await map.hover();
  for (let i = 0; i < 20; i += 1) {
    await page.mouse.wheel(0, -200);
  }
  await map.click({ position: { x: 10, y: 10 } });

  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText(/outside the Chennai Metropolitan Area/i)).toBeVisible();
});
```

- [ ] **Step 3: Run the tests to verify the current state**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; npx supabase status || npx supabase start; npm run test:e2e`
Expected: both tests should PASS if Tasks 1–15 were implemented correctly (this task doesn't add product code, only verification). If either fails, treat it as a signal that an earlier task has a bug — use `superpowers:systematic-debugging` rather than patching the test to hide the failure.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/report-flow.spec.ts playwright.config.ts
git commit -m "Add e2e tests: live realtime pin and outside-CMDA error"
```

---

## Final verification

After all 16 tasks:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
npx supabase db reset
npx supabase test db
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

All five commands should pass with zero errors before considering this slice done.

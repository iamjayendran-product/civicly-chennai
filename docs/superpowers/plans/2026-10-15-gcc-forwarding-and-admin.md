# Civicly → GCC: GCC-only map, GCC-style location picker, forwarding, admin review

## Context

Today a Civicly report only goes on our own map, and the map covers the whole CMDA area. The goals
for this slice:

1. **File every report as a real GCC complaint.** It goes into Greater Chennai Corporation's
   grievance system (https://gccservices.in/pgr/registercomplaints) **anonymously**: "No" to mobile
   and "No" to email, so there's no OTP. The GCC complaint number then shows on the Civicly report.
2. **Map categories properly.** Potholes and water stagnation go to the right GCC complaint
   type/sub-type.
3. **Limit Civicly to GCC's area.** The map and server-side checks change from CMDA to the GCC
   boundary, since GCC can only act inside its limits.
4. **Make the location step look and work like GCC's form:**
   - Map/Satellite toggle and fullscreen
   - place search box
   - click to drop a pin, with a "Latitude : … / Longitude : …" popup
   - Street picker, Landmark, Lat/Lng fields
   - street-level view
5. **Admin screen.** Lists every report with reporter details. One click flags a report so it's
   hidden and never forwarded.

This changes the spec's out-of-scope list (GCC forwarding, admin dashboard) and CLAUDE.md rule 4
(CMDA only), so the spec and CLAUDE.md are updated in the same PR.

### What we found on GCC's side (read-only inspection, 2026-10-15)

- **The form posts to a plain API.** There's no CAPTCHA and no CSRF token. OTP only applies when
  you share a mobile number.
- **`POST /pgr/api/register`** takes form-encoded fields:
  - `ComplainantName`, `ComplainantAddr`, `MobileNo=""`, `Email=""`
  - `ComplaintTitle` (sub-type name), `ComplaintType` (sub-type id), `ComplaintDetails`
  - `StreetId`, `Landmark`
  - `Comp_Image` (a `data:image/jpeg;base64,…` string under 1 MB)
  - `latitude`, `longtitude` (sic), `gender` (male|female|transgender)

  It returns `{ complaintNumber }`.
- **Category IDs** come from `GET /pgr/api/getComplaintCategories`:

  | Civicly | GCC group → sub-type (id) |
  |---|---|
  | **pothole** | Road and Footpath (18) → *Pot hole fill up / Repairs to the damaged surface* (**112**) |
  | **waterlogging** | Water Stagnation (20) → *Stagnation of Water* (**138**) |
  | other / open_manhole | Water Stagnation (20) → *Covering Manholes of Storm Water Drain* (143) |
  | other / damaged_footpath | Road and Footpath (18) → *Repairs to existing Footpath* (115) |
  | other / dug_up_road | Road and Footpath (18) → *Relaying of Road* (113) |
  | other / debris | Garbage (17) → *Removal of Debris* (99) |
  | other / speed_breaker, signage, other | Road and Footpath (18) → 112. This is a placeholder: GCC has no closer type, and the note text explains the actual issue. |

- **Street lookup.** GCC's form picks the street from the GIS layer
  `gisgcc.chennaicorporation.gov.in/server/rest/services/GCCDepts/EDPMobile2025/FeatureServer/0/query`,
  using the point, `distance=25` m and `f=geojson`. It returns `road_id`, `road_name`, `region`,
  `new_zone`, `new_ward` and `type`. If nothing comes back, GCC shows "No Street Found — please
  select the nearby street". `road_id` becomes `StreetId`. We use the same layer.
- **GCC's map is Google Maps**, with GCC's own API key. We won't reuse that key, and you chose not
  to add a Google key, so Civicly **stays on MapLibre and copies the look and controls** (see
  Design §3).

### Risks to accept

- This is an **undocumented internal GCC API**, used without permission. It can change or block us
  without warning.
  - Mitigations: a kill switch (`GCC_FORWARDING_ENABLED`), retries, and a cap per batch.
  - Every report waits through a 2-hour hold (during which an admin can flag it) and is never
    sent twice.
  - Our User-Agent is honest.
  - **Recommended in parallel:** email GCC IT asking for approved access.
- **Mapillary street-level photos are thin in Chennai.** The street-view button only appears where
  photos exist.

## Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Area | **GCC limits only.** Replaces CMDA for the map extent, the server-side check, place search and the street lookup. |
| Map engine | **MapLibre** (no Google key), styled like GCC's form. **Street view via Mapillary**, which is free and needs a token but no billing. |
| Timing | Hold for **2 h** (in `app_settings`), then forward if the report is open, not hidden and not flagged. |
| Gender | A **required radio** (Male / Female / Transgender) on the Civicly form, sent as is. |
| Name | The reporter's name if given, otherwise `Anonymous (via Civicly Chennai)`. Mobile and email are always empty. |
| Street | **Required.** The reporter picks one from the GCC street list within 25 m of the pin, the same as GCC's form. |
| Admin review | Sent automatically. One-click **Flag** hides the report from the map and stops the GCC send. Undo, optional reason, bulk flag. |
| Admin login | **Email magic link, allowlisted** (`iamjayendran@gmail.com`), with `shouldCreateUser: false`. |
| Admin UI | **Table with row actions.** Columns: photo, category, reporter name with report count, phone, GCC status. Rows expand for details. |

## Design

Business rules stay in Postgres. Calls out to GCC happen only in server-only Next.js code, apart
from the public GIS street lookup, which the browser makes, the same as GCC's own form.

### 1. GCC service area (replaces CMDA)

- **Boundary source:** the GCC limits. One option is the OSM admin relation "Greater Chennai
  Corporation" (the 200-ward, ~426 km² limit). The other is the union of the public GCC ward GeoJSON
  (OpenCity/DataMeet). Fetch it once, simplify it (~50 m tolerance) and commit it to
  `supabase/seed-data/gcc_boundary.geojson`, recording the source and licence in the file
  header. ODbL attribution is already shown for OSM.
- **Migration `…_gcc_service_area.sql`:**
  - add `public.gcc_boundary`, with the same shape and select policy as `cmda_boundary`
  - `create_report` raises a new code **`OUTSIDE_GCC`** instead of `OUTSIDE_CMDA`
  - existing reports outside GCC are set `is_hidden = true`, with a note in the migration that
    these are seed/demo rows
  - `cmda_boundary` stays in place but unused; dropping it would be a separate change
- **Client:**
  - `src/lib/geo/cmda.ts` → `src/lib/geo/serviceArea.ts` with `GCC_BBOX`, `GCC_CENTER` and
    `GCC_MAX_BOUNDS`. `padBounds` and the bounds helpers stay; callers are updated in `MapView`,
    `LocationPicker`, `GateBackgroundMap`, `useReports` and `placeSearch`.
  - Draw the GCC outline and a dim mask outside it on every map, from the same GeoJSON imported
    as a static asset.
  - Nominatim search uses the GCC viewbox with `bounded=1` (`src/lib/geo/placeSearch.ts`).
- **i18n:** `OUTSIDE_GCC` → "This spot is outside Greater Chennai Corporation limits."

### 2. Report location step, GCC-style (`src/components/report/LocationPicker.tsx`)

The layout copies GCC's "2. Complaint Location Details":
```
┌[ Map | Satellite ]──────[ Search a place or road…        ]──────[⛶]┐
│                                                                    │
│                 ┌───────────────────────┐                          │
│                 │ Latitude : 13.052020  │                          │
│                 │ Longitude : 80.204032 │                          │
│                 └──────────▼────────────┘                     [🚶] │
│                            📍                                  [+] │
│                                                                [−] │
└──────────────────────────────────────────────────────────── © OSM ┘
 Street: [ Arunachalam Road ▾ ]             Longitude: [80.204032]
 Landmark: [ Arunachalam Road      ]        Latitude:  [13.052020]
```
- **Pin:** click or tap the map to drop or move the pin, with a popup showing lat/lng to 6
  decimals. The pin is also draggable, and geolocate still works.
- **Street list:** dropping the pin calls the GCC street lookup (new
  `src/lib/gcc/streetLookup.ts`, client-safe, 5 s timeout).
  - The **Street** dropdown is filled with the results, nearest first, with the first one
    pre-selected.
  - **Landmark** defaults to the road name and can be edited.
  - No result → "No GCC street found here — move the pin onto the nearest street", and the
    step can't continue.
  - A timeout or network error → "Couldn't reach GCC's street list, try again", with a retry
    button.
- **Search box:** results come from two sources, merged:
  - Nominatim places (existing)
  - GCC road-name suggestions from `Hosted/Road_API … where UPPER(road_name) LIKE '%Q%'`, the
    same as GCC's form
- **Controls:**
  - **Map | Satellite** segmented toggle, top-left. This replaces `MapStyleSwitcher` on this
    step. The style ids already exist in `src/lib/map/styles.ts`.
  - **Fullscreen**, top-right: MapLibre `FullscreenControl`.
  - **Zoom +/−** and **geolocate**: `addStandardControls`.
  - **Street view 🚶**, bottom-right (see §3).
- **Data stored:** the report carries `gcc_street_id`, `gcc_road_name`, `gcc_zone`, `gcc_ward` and
  `landmark`. These are new nullable columns, set through new `create_report` parameters.
  `INVALID_INPUT` is raised if the street id is missing. Zone and ward also let the map and admin
  screen filter by ward later.

### 3. Shared map look and street view (all Civicly maps)

- **Same controls everywhere:** the Map | Satellite toggle and fullscreen go on the Discovery and
  live maps too, matching GCC's controls. The current 3D / terrain / dark style options are
  **removed from the switcher** to match GCC's two choices. The Home globe fly-in animation stays.
- **Street view** (new `src/components/map/StreetView.tsx` plus `src/lib/map/mapillary.ts`):
  - The 🚶 button turns on the Mapillary coverage layer: green sequence lines, from the
    `mly1_public` vector tiles with `NEXT_PUBLIC_MAPILLARY_TOKEN`.
  - Clicking near a line opens a `mapillary-js` viewer panel (bottom sheet on a phone, right-side
    panel on a laptop) at the nearest image. The panel can be closed.
  - Without a token, the button is hidden.
  - `mapillary-js` is pinned to an exact version and loaded only when the button is used.
  - Attribution: "Imagery © Mapillary contributors" in the viewer.

### 4. GCC forwarding

- **Migration `…_gcc_forwarding.sql`:**
  - Add `gender` to `public.report_contacts` (check `male|female|transgender`).
  - Add `app_settings(key pk, value jsonb)`, seeded with `gcc_hold = '2 hours'`.
  - Add `gcc_submissions(report_id pk, status pending|in_flight|submitted|failed|blocked, attempts,
    last_error, next_attempt_at, complaint_number, submitted_at, blocked_reason, blocked_by,
    blocked_at)`. It has RLS, no policies and no grants.
  - Add public `reports.gcc_status` and `reports.gcc_complaint_number`, so map and Realtime
    updates carry them.
  - `create_report` gets a new overload with `p_gender`, `p_gcc_street_id`, `p_gcc_road_name`,
    `p_gcc_zone`, `p_gcc_ward` and `p_landmark`. It drops the old signature first, as earlier
    migrations did. It inserts a `pending` submission due at `now() + gcc_hold`.
  - `claim_gcc_submissions(p_limit)` is `service_role` only and uses `for update skip locked`. It
    takes rows that are due, open, not hidden, not blocked, and have fewer than 5 attempts. It
    marks them `in_flight` and returns the payload inputs.
  - `record_gcc_result(p_report_id, p_complaint_number, p_error)` handles both outcomes:
    `submitted`, or a backoff of 5m, 30m, 2h, 12h, then `failed`.
  - `pg_cron` + `pg_net` run every 5 min, POSTing to `{SITE_URL}/api/gcc/forward` with the
    `GCC_FORWARD_SECRET` header.
- **Server-only `src/lib/gcc/`** (imports `server-only`):
  - `categoryMap.ts` holds the table above as typed constants. A test checks every enum value is
    mapped.
  - `buildPayload.ts` is pure. Mobile and email are always `""`. The title is the sub-type name.
    The details are the category, note, "Ward/Zone" and the Civicly link `/r/{id}`.
    `ComplainantAddr` and `Landmark` come from the stored road and landmark.
  - `photo.ts` loads the first photo with the service role, re-encodes it under 1 MB, and turns
    it into a data URL.
  - `client.ts` sends `POST {GCC_BASE_URL}/pgr/api/register` and parses `complaintNumber`. A
    missing or `"null"` value counts as a failure.
- **Route `src/app/api/gcc/forward/route.ts`:**
  - checks the secret and the kill switch
  - claims 5, then sends them one after another with a delay between each
  - records each result

  Read the Next 16 route-handler docs first.
- **Report form:**
  - The gender radio goes on `ReportStepContact.tsx`, with validation in
    `src/lib/report/validation.ts`.
  - Notice: "We'll file this with Greater Chennai Corporation anonymously."
  - Status on the success screen, PinSheet and `/r/[id]`: "Filing with GCC…", "GCC complaint #…"
    or "Couldn't file with GCC".

### 5. Admin screen `/admin`

- **Auth:**
  - `admin_users(email)`, seeded with `iamjayendran@gmail.com`.
  - `is_admin()` requires the email to be in the list, the user to be non-anonymous, and the
    email to be confirmed.
  - Every admin RPC raises `AUTH_REQUIRED` otherwise. RLS isn't loosened anywhere.
- **RPCs:**
  - `admin_list_reports(filter, search, before, limit)` covers the report, contact (name, phone,
    gender), GCC submission, street/ward and `reporter_report_count`. It includes hidden reports.
  - `admin_reporter_reports(report_id)` is keyed by report, so the reporter's uuid is never
    exposed.
  - `admin_flag_reports(ids[], reason?)` sets `is_hidden = true` and blocks any send that isn't
    `submitted` yet. If a report is already filed, it's hidden and the result says "already
    filed with GCC #…".
  - `admin_set_flag_reason` records the reason.
  - `admin_unflag_reports(ids[])` un-hides and re-queues with `next_attempt_at ≥ now() + 10 min`.
  - `admin_retry_gcc(id)`.
  - Reasons are `spam | duplicate | not_road_issue | abusive_photo | other`.
- **Login page `/admin/login`:** `signInWithOtp({ shouldCreateUser: false, emailRedirectTo:
  '/admin' })`.
- **`/admin` page:** a server component that redirects anyone who isn't an admin.
  ```
  [Pending ▾] [Ward ▾] [Search…]                 [🚫 Flag selected (2)]
  ☐ │Photo│ Category  │ Reporter  │ Phone      │ Ward │ GCC     │
  ☑ │ ▣   │ Pothole   │ Ravi K (4)│ 98xxxxxx12 │ 128  │ ⏳ 1h58 │ [🚫 Flag]
  ☐ │ ▣   │ Water stg.│ Priya (1) │ 90xxxxxx45 │ 064  │ ✅ 48213│  Filed
  ☐ │ ▣   │ Other     │ Anon (9)  │ —          │ 011  │ 🚫 spam │ [Undo]
    row expands → photos, note, street/landmark, map link, gender,
                  reporter's other reports, GCC number / last error, [Retry]
  ```
  - Flagging is one click (row or bulk) and takes effect immediately. A toast then offers
    **Undo** and an optional reason.
  - Filters: Pending send (default) / Flagged / Filed / Failed / All, plus ward.
  - Components live in `src/components/admin/`. Strings go through i18n, and the existing
    theme tokens are used.
  - `useReports` (`src/lib/realtime/useReports.ts`) must drop a pin when an UPDATE sets
    `is_hidden = true`. Check this and test it.

### 6. Env, spec, docs

- **`.env.example`:**
  - server-only: `GCC_FORWARDING_ENABLED`, `GCC_FORWARD_SECRET`, `GCC_BASE_URL`, `SITE_URL`
  - public: `NEXT_PUBLIC_MAPILLARY_TOKEN`
- **Spec:**
  - change CMDA to GCC throughout
  - new §4.7 GCC forwarding, §4.8 Admin review and §4.9 Location step and street view
  - data-model rows
  - the out-of-scope list
- **CLAUDE.md:**
  - rule 4 becomes "GCC only (`OUTSIDE_GCC`)"
  - error-code list
  - out-of-scope list
  - stack line: MapLibre + Mapillary

## Tasks (TDD order)

0. **Do first:** move the unmerged photo-listing privacy fix `af13946`, and what's left of
   `6898f7a`, onto main as new migrations or commits. Then remove the stale worktree.
1. Fetch and simplify the GCC boundary, commit the GeoJSON, then:
   - pgTAP: `OUTSIDE_GCC` for a Tambaram point, OK for a Vadapalani point
   - the migration
   - `serviceArea.ts` and its tests
   - update `cmda` callers
2. `streetLookup.ts` and road-suggestion parsing, as Vitest tests with recorded GCC fixtures.
3. LocationPicker rebuild:
   - pin popup, Street dropdown, Landmark, Lat/Lng fields, no-street blocking
   - Map/Satellite toggle and fullscreen
   - component tests
4. Shared controls on Discovery and live maps, then street view (Mapillary) behind the token.
5. GCC forwarding:
   - migration and pgTAP: gender, street required, hold, claim filters, skip locked,
     backoff, grants
   - `categoryMap`, `buildPayload`, `photo` and `client` tests
   - route handler with a mocked fetch
6. Form gender step and GCC status display.
7. Admin:
   - migration and pgTAP: auth gating, list, flag/unflag/bulk, already filed, retry
   - magic-link login and the `/admin` table
   - the `useReports` hidden-row fix
8. Spec, CLAUDE.md and `.env.example`. Regenerate DB types after each migration.

## Verification

- `npm run lint && npm run typecheck && npm test && npm run db:test`.
- **Map:**
  - Panning stops at the GCC limits, with the outline and mask visible.
  - Search for "Arunachalam Road": the street appears in the dropdown, the popup shows lat/lng,
    and Landmark is filled in.
  - Dropping a pin in Tambaram blocks the step. Calling the RPC directly there gives
    `OUTSIDE_GCC`.
  - Map/Satellite and fullscreen work. With a token, 🚶 shows coverage and opens the viewer.
- **Forwarding (stubbed):**
  - Point `GCC_BASE_URL` at a local mock that returns `{"complaintNumber":"TEST123"}`.
  - Submit a pothole and a waterlogging report. Set the hold to 1 minute and call
    `/api/gcc/forward`.
  - Confirm the mock got `ComplaintType=112` / `138`, empty mobile and email, the right
    `StreetId` and the photo. The number should appear live on the pins.
- **Admin:**
  - Sign in by magic link (local Inbucket :54324) and flag a pending report. The pin disappears
    live in a second browser and the forwarder skips it.
  - Undo brings it back and it's filed after the hold.
  - Bulk flag works.
  - An email that isn't on the list gets no link.
- **Live GCC submission, once and only with your go-ahead:** file one genuine pothole, confirm the
  number in GCC's "Check Status", then turn forwarding on.

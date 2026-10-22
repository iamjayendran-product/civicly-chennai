# GCC Filing Log — Admin Screen

Date: 2026-10-21 · Status: draft for approval · Amends:
`2026-09-21-chennai-road-grievance-mvp-design.md` (§1 Non-goals, §5, §6)

## 1. Intent

Jay (the only operator) files Civicly reports with the Greater Chennai Corporation
**by hand**, using GCC's Public Grievance Redressal (PGR) portal, the Namma Chennai app
or 1913. After a successful filing, GCC returns a complaint number such as
`2026-736JEJ`. Today Civicly has nowhere to record that number, so the link between a
citizen's report and its GCC complaint is lost.

This feature adds a private `/admin` screen that:

1. shows a **work queue** of reports that still need filing, with every detail Jay has
   to type into GCC's form (photos, category, note, location, reporter name and phone)
   and one-tap copy buttons;
2. lets Jay record the **GCC complaint ID**, a free-text note and a **GCC status**
   against the report, and update the status later;
3. keeps all of it **admin-only**: nothing about GCC filing is shown publicly (Jay's
   decision, 2026-10-21: the public badge was dropped).

Success: Jay can work through the queue on a phone, file each report on GCC in another
tab, paste the complaint number back, and never lose track of which reports were filed
or where each one stands.

## 2. Scope

### Goals
- A single-admin `/admin` page, gated server-side to one hard-coded email address.
- An Unfiled/Filed queue of open, visible reports.
- Record and edit the GCC complaint ID, status and note, with automatic filed-at and
  filed-by.
- A history of every save, so status changes over time are visible.

### Non-goals
- Automatic submission to GCC, or scraping or syncing GCC's status. Everything is
  entered by hand.
- Multiple admins, roles, an admin table or an admin-management UI. Changing the admin
  means a new migration.
- Moderation tools (hide or unhide, edit reports), analytics, exports.
- Any public "Filed with GCC" badge or other public indication of filing (dropped
  2026-10-21; would need its own spec change).
- Forwarding to any authority other than GCC.

### Anti-goals (a failure even if it "works")
- Reporter name or phone reachable by anyone except the admin, through the Data API,
  Realtime or page source.
- Admin checks done only in Next.js. The database must refuse non-admins on its own.
- Any GCC filing data (ID, status, note, filer, or even the fact of filing) reaching
  a public surface.

### Spec amendment
In the MVP spec §1 Non-goals, replace "admin/moderator dashboard" and "forwarding to GCC
or other civic bodies" with:
"moderator dashboard; automatic forwarding to GCC or other civic bodies (a
single-admin **manual GCC filing log** is in scope; see
`2026-10-21-gcc-filing-admin-design.md`)". Make the matching edits in CLAUDE.md's
"Out of scope" list. Add the new tables and RPCs to §5 and `app/admin/` to §6.

## 3. Access control

- **Who:** only `iamjayendran@gmail.com` (Jay's decision, 2026-10-21). The email is
  **hard-coded** in the database check and committed in the migration. Jay accepted that
  it becomes visible if the repo is ever public. There's no admin table and no seed step.
- **`public.is_admin()`** (`security definer`, `stable`, `search_path = ''`) returns
  true only when **both** of these hold:
  - `(auth.jwt() ->> 'is_anonymous')::boolean is not true`;
  - `lower(btrim(auth.jwt() ->> 'email')) = 'iamjayendran@gmail.com'`;
  - the JWT `amr` claim includes method `otp` (or `magiclink`). In other words, the
    session came from a magic link, which proves inbox access. Without this, anyone
    could sign up with a password for the admin address while email confirmation is off
    (added after the final review, 2026-10-22).

  Every admin RPC begins with `if not public.is_admin() then raise exception
  'AUTH_REQUIRED' using errcode = 'P0001'; end if;`.
- **Sign-in: email magic link, once per device** (Jay's decision). There's no Google
  sign-in and no sign-in or "not authorised" screens beyond this minimal step:
  - On `/admin` without an admin session, the page shows one email field and a "Send
    sign-in link" button. This calls `supabase.auth.signInWithOtp({ email, options:
    { emailRedirectTo: <origin>/admin } })`, then shows "Check your email".
  - Clicking the emailed link returns to `/admin`. The browser client (PKCE, the
    `@supabase/ssr` default) exchanges the code and replaces the anonymous session. The
    link must be opened in the **same browser** it was requested from, because the PKCE
    verifier is stored there. The UI says so.
  - Supabase keeps the session (with refresh) on that device, so later visits open
    straight into the queue.
  - If someone else enters their own email, they get a working session but
    `admin_whoami()` is false. They just see the same email form again. No separate
    "not authorised" screen (my call).
  - The `SessionProvider` must not sign a user back in anonymously while a non-anonymous
    session exists.
- **Setup steps (no code):**
  - add `<origin>/admin` to Auth → URL configuration → Redirect URLs, both locally
    (`additional_redirect_urls` in `supabase/config.toml`) and on the hosted project;
  - the hosted project's default email sender is rate-limited to a few emails an hour,
    which is fine for one admin.

  Locally, emails appear in the Supabase mail inbox (Mailpit/Inbucket, port 54324).
- **Page gate:** `/admin` is a client page. On load it calls `admin_whoami()`, which
  returns a boolean, and shows either the email form or the queue. This UI gate is only
  cosmetic. Security comes from the RPCs. Add `robots: noindex` metadata to the page.

## 4. Data model (new migration, append-only)

```sql
-- Codes mirror the eGovernments PGR workflow that GCC's portal runs on.
create type public.gcc_status as enum (
  'registered', 'forwarded', 'processing', 'completed',
  'rejected', 'reopened', 'withdrawn', 'not_completed'
);

-- Private: one row per filed report. Default-deny (no grants, no policies).
create table public.gcc_filings (
  report_id     uuid primary key references public.reports(id) on delete cascade,
  complaint_id  text not null check (char_length(complaint_id) between 3 and 40),
  status        public.gcc_status not null default 'registered',
  note          text check (char_length(note) <= 1000),
  filed_at      timestamptz not null default now(),
  filed_by      uuid not null references auth.users(id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid not null references auth.users(id)
);
create index gcc_filings_complaint_id_idx on public.gcc_filings (complaint_id);

-- Private: append-only history of every save.
create table public.gcc_filing_events (
  id           bigserial primary key,
  report_id    uuid not null references public.reports(id) on delete cascade,
  complaint_id text not null,
  status       public.gcc_status not null,
  note         text,
  actor        uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);
```

- No change to `public.reports`, `reports_in_bbox` or Realtime.
- **Status labels:** the codes above follow eGov PGR's standard workflow (Registered,
  Forwarded, Processing, Completed, Rejected, Reopened, Withdrawn, Not Completed). GCC's
  live portal shows statuses only after you enter a real complaint number, so we
  couldn't check the exact wording. Display labels live in the i18n catalog, so fixing
  the wording is a one-line `en.json` change. Adding or removing a status takes a new
  migration (`alter type ... add value`).
- **Complaint ID format:** examples from GCC are `YYYY-NNNXXX`, e.g. `2026-736JEJ`. The
  server only trims the value, uppercases it and checks the length. The UI shows the
  example as a placeholder and a soft warning (not a block) when the value doesn't match
  `^\d{4}-\d{3}[A-Z]{3}$`, because other GCC channels may use other formats.
- Complaint IDs are **not unique**: two near-duplicate reports may share one GCC
  complaint. When saving an ID that's already used on another report, the UI shows a
  non-blocking notice.

## 5. RPCs (all `security definer`, `search_path = ''`, admin-gated)

| Function | Purpose |
|---|---|
| `admin_whoami() returns boolean` | `public.is_admin()`. It's the one admin function that doesn't raise for non-admins. |
| `admin_gcc_queue(p_tab text, p_status gcc_status default null, p_limit int default 20, p_before timestamptz default null)` | `p_tab` is `'unfiled'` or `'filed'` (anything else raises `INVALID_INPUT`). Returns reports with `status = 'open' and not is_hidden`. **Unfiled:** no `gcc_filings` row, newest `created_at` first. **Filed:** has a row, optionally filtered by `p_status`, newest `updated_at` first. Keyset pagination on that timestamp. Each row includes: id, category, subtype, note, lng, lat, created_at, upvote_count, the reporter's name and phone from `report_contacts` (nullable for older reports), `photo_paths text[]` (kind = 'report'), and the filing fields (complaint_id, status, note, filed_at, updated_at). |
| `admin_gcc_counts() returns (unfiled int, filed int)` | Tab badges. |
| `admin_save_gcc_filing(p_report_id uuid, p_complaint_id text, p_status gcc_status default 'registered', p_note text default null)` | Upserts `gcc_filings`. Sets `filed_at`/`filed_by` on first save and `updated_at`/`updated_by` on every save. Appends a `gcc_filing_events` row. Raises `INVALID_INPUT` for a blank or overlong ID or note, and for a report that doesn't exist. Returns the saved row plus `duplicate_of uuid[]` (other reports with the same complaint_id). |
| `admin_gcc_history(p_report_id uuid)` | The event rows for one report, oldest first. |

If a filed report is later fixed or hidden, its filing record is kept, but the report
drops out of the queue (see §6).

## 6. Admin UI — `/admin`

Mobile-first, same Tailwind look as the rest of the app. All strings in `en.json`
under `admin.*`.

- **Header:** "GCC filing", plus Unfiled (n) / Filed (n) tabs. On the Filed tab, a
  status filter chip row (All + the 8 statuses).
- **Card (one per report):**
  - photo thumbnails (tap opens full size; public bucket URL from `photo_paths`);
  - category / subtype, note, "Reported 3 days ago", "+14 people reported this"
    (`upvote_count`);
  - location: lat, lng and an "Open in Google Maps" link
    (`https://maps.google.com/?q=lat,lng`). No reverse-geocoded address (my call: none
    exists in the app yet, and GCC's form takes a location pin or landmark anyway);
  - reporter name and phone ("—" when absent). Jay files GCC complaints under the
    **reporter's** name and phone, as collected today. The report form isn't changed
    and no consent flag is added (Jay's decision, 2026-10-21);
  - **Copy** buttons for: description (category + subtype + note, formatted for
    GCC's description field), coordinates, maps link, name, phone. A "Copy all" button
    copies one block with everything;
  - link to the public report (`/r/[id]` once that page exists; until then, the home
    map focused on the pin, if the map supports deep links, otherwise no link).
- **Filing form on the card:**
  - Unfiled: a GCC complaint ID input (placeholder `2026-736JEJ`), an optional note,
    and **Mark as filed**. The status defaults to Registered.
  - Filed: shows the ID, status, note, filed date and last-updated date, with
    **Edit**, which lets you change the ID, status and note, and **History**, which
    expands the event list.
  - After saving, the card moves from Unfiled to Filed with an undo-free toast:
    "Saved · 2026-736JEJ".
- Errors map typed codes through i18n (`AUTH_REQUIRED` → "Your session isn't an admin
  session. Sign in again.", `INVALID_INPUT` → field message).
- Pagination: a "Load more" button (keyset). No Realtime on the admin screen. A
  pull/refresh button re-queries (my call: one admin, so no live updates needed).

## 7. Files (expected)

```
supabase/migrations/20261021100{000,100,200}_*.sql         # allowlist; filing tables + save RPC; queue RPCs
supabase/tests/gcc_*.test.sql                              # pgTAP
src/app/admin/page.tsx                                     # gate + queue
src/components/admin/{AdminGate,GccQueue,GccReportCard,GccFilingForm,CopyButton}.tsx
src/lib/admin/{gccApi,formatForGcc,complaintIdFormat}.ts   # RPC wrappers + pure helpers (+ tests)
src/lib/i18n/messages/en.json                              # admin.* + gcc status labels
src/lib/supabase/database.types.ts                         # regenerated
```

## 8. Testing (TDD)

- **pgTAP:**
  - Non-admins are refused by every `admin_*` RPC except `admin_whoami`: anon role,
    anonymous user, and a signed-in user with a different email. A JWT carrying the
    admin email but `is_anonymous = true` is refused too.
  - `gcc_filings` and `gcc_filing_events` are unreadable and unwritable
    directly by anon and authenticated.
  - Queue tab membership, ordering, and the exclusion of fixed and hidden reports.
  - The upsert sets filed_* only once, appends history, and returns
    duplicates.
- **Vitest:**
  - `formatForGcc` (copy text);
  - `complaintIdFormat` (normalise and soft-validate);
  - the card's state switch between unfiled and filed;
  - the gate states.
- **Playwright** (optional for this feature): admin signs in, files a report, and it
  moves to the Filed tab.

## 9. Calls I made (please check)

1. *(Jay's decision)* There's a **single hard-coded admin email** in `is_admin()`,
   committed in the migration.
2. *(Jay's decision)* **Email magic-link** sign-in, once per device. It doesn't link the
   anonymous session. Non-admins just see the email form again.
3. The status list follows **eGov PGR's workflow** (unverified against the live GCC
   page). The labels are easy to change.
4. Complaint IDs are **soft-validated** and **not unique**, with a warning on
   duplicates.
5. The ID, status and note are editable, and every save is logged in a **history
   table**.
6. *(Jay's decision)* Reports that become fixed or hidden **leave the queue**, including
   the Filed tab, so their GCC status can no longer be updated. Their filing record
   remains.
7. There's no address lookup: coordinates plus a Google Maps link only.
8. The admin screen doesn't use Realtime and refreshes manually.
9. *(Jay's decision)* GCC complaints are filed with the **reporter's** name and phone, and
   the report form is unchanged.
10. *(Jay's decision)* There's **no public badge**: filing is admin-only.

## 10. Builder's freedom

Component breakdown, exact styling, copy-text wording, toast and loading details, and
pagination size are all up to the builder.

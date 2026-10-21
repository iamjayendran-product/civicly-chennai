# GCC Filing Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the single admin a private `/admin` work queue for filing Civicly reports
with GCC by hand. The admin records each GCC complaint ID, status and note there. All
filing data stays admin-only.

**Architecture:** Three append-only migrations add a hard-coded single-email
`is_admin()` check, the `gcc_filings` and `gcc_filing_events` tables (default-deny), and admin-gated `security definer` RPCs.
The Next.js `/admin` page is a thin client over those RPCs. Public tables, map RPCs and
Realtime don't change.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js 16 App Router, React 19,
TypeScript strict, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-gcc-filing-admin-design.md` (read it
first). The base spec is `docs/superpowers/specs/2026-09-21-chennai-road-grievance-mvp-design.md`.

## Global Constraints

- Business rules and writes live in Postgres. Every `admin_*` RPC except `admin_whoami`
  starts with `if not public.is_admin() then raise exception 'AUTH_REQUIRED' using
  errcode = 'P0001'; end if;`.
- RPCs are `security definer`, `set search_path = ''`, and every identifier is
  schema-qualified.
- `gcc_filings` and `gcc_filing_events` get RLS enabled, no policies, and
  `revoke all ... from anon, authenticated`.
- Error codes: only `AUTH_REQUIRED` and `INVALID_INPUT`, raised as `P0001`.
- Migrations are append-only, and each DB task gets its own new file (never edit one
  committed earlier):
  - `20261021100000_admin_check.sql`
  - `20261021100100_gcc_filings.sql`
  - `20261021100200_gcc_queue_rpcs.sql`

  Regenerate `database.types.ts` in Task 3.
- All UI strings go through `t()` in `src/lib/i18n` (`en.json`); none are hard-coded.
- The only admin is `iamjayendran@gmail.com`, hard-coded in `is_admin()`. There's no
  admin table, no seed file, and no Google sign-in.
- Nothing GCC-related reaches a public surface: `public.reports`, `reports_in_bbox`,
  Realtime and the map stay unchanged.
- GCC status codes, in this order: `registered, forwarded, processing, completed,
  rejected, reopened, withdrawn, not_completed`.
- Complaint ID format hint is `^\d{4}-\d{3}[A-Z]{3}$`, placeholder `2026-736JEJ`.
  Mismatches are soft warnings only.
- Next 16: check `node_modules/next/dist/docs/` before using `metadata` or
  client/server component APIs.
- Commit messages are imperative, end with the
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, and go on branch
  `feat/gcc-filing-admin`.

## Review Focus

1. **Email case and whitespace.** A JWT email of `IamJayendran@Gmail.com` must still
   count as the admin. An anonymous JWT that somehow carries that email must not.
   *Task 1 tests.*
2. **Complaint ID input.**
   - Pasted with spaces or lowercase: `" 2026-736jej "` is saved as `2026-736JEJ`.
   - An all-whitespace ID is rejected with `INVALID_INPUT`, not saved as empty.
   *Task 2 tests.*
3. **Re-saving a filed report.**
   - Changing only the status keeps the original `filed_at`/`filed_by`.
   - It still appends a history row.
   *Task 2 tests.*
4. **Older reports with no `report_contacts` row** still appear in the queue, with null
   name and phone, and the card shows "—" rather than crashing. *Task 3 (pgTAP) and
   Task 5 (card test).*
5. **A report becomes fixed or hidden after filing.** It leaves the Filed tab and the
   counts drop. *Task 3 tests.*

---

### Task 1: Single-email `is_admin()` check

**Files:**
- Create: `supabase/migrations/20261021100000_admin_check.sql`
- Create: `supabase/tests/gcc_admin_auth.test.sql`
- Modify: `supabase/config.toml` → add `"http://127.0.0.1:3000/admin"` and
  `"http://localhost:3000/admin"` to `[auth] additional_redirect_urls`
- Modify: `README.md` → "Admin access" section. It covers:
  - the magic-link flow, once per device, opening the link in the same browser;
  - adding `<origin>/admin` to the hosted project's Redirect URLs;
  - where local emails appear (port 54324).

**Interfaces:**
- Produces:
  - `public.is_admin() returns boolean` (stable, security definer);
  - `public.admin_whoami() returns boolean`, granted to `anon, authenticated`.

- [ ] **Step 1: Write the failing pgTAP test** `gcc_admin_auth.test.sql`. Assert:
  - no JWT: `admin_whoami()` returns `false`;
  - claims `{"sub":<uid>,"role":"authenticated","is_anonymous":false,"email":"IamJayendran@Gmail.com"}`:
    returns `true` (case-insensitive);
  - the same email with `"is_anonymous":true`: returns `false`;
  - `"email":"someone@else.com"` with `is_anonymous` false: returns `false`;
  - no `email` claim with `is_anonymous` false: returns `false`.
- [ ] **Step 2: Run** `npm run db:reset && npm run db:test`. Expected: the new file
  FAILs (function does not exist).
- [ ] **Step 3: Implement** `is_admin()` and `admin_whoami()` per spec §3. Read claims
  with `auth.jwt()`. Revoke execute on `is_admin()` from `public` and grant it to
  `anon, authenticated`.
- [ ] **Step 4: Run** `npm run db:reset && npm run db:test`. Expected: all PASS.
- [ ] **Step 5: Commit** "Add single-email is_admin check".

### Task 2: GCC filing tables and `admin_save_gcc_filing`

**Files:**
- Create: `supabase/migrations/20261021100100_gcc_filings.sql`
- Create: `supabase/tests/gcc_save_filing.test.sql`

**Interfaces:**
- Consumes: `public.is_admin()`.
- Produces:
  - `public.gcc_status` enum;
  - `public.gcc_filings` and `public.gcc_filing_events` as specified in spec §4;
  - `public.admin_save_gcc_filing(p_report_id uuid, p_complaint_id text, p_status
    public.gcc_status default 'registered', p_note text default null)
    returns table (report_id uuid, complaint_id text, status public.gcc_status, note
    text, filed_at timestamptz, updated_at timestamptz, duplicate_of uuid[])`.

- [ ] **Step 1: Write the failing pgTAP test.** Fixtures:
  - an admin user;
  - a signed-in non-admin user (different email);
  - reports A and B (owner rows like `confirm_same_issue.test.sql`).

  Assert:
  - non-admin call → `throws_ok(..., 'P0001', 'AUTH_REQUIRED')`;
  - admin saves A with `' 2026-736jej '`, then `gcc_filings.complaint_id =
    '2026-736JEJ'`, `status = 'registered'`, and `filed_by` = admin;
  - there's 1 event row;
  - `'   '` → `INVALID_INPUT`; a 41-character ID → `INVALID_INPUT`; a 1001-character
    note → `INVALID_INPUT`; an unknown report id → `INVALID_INPUT`;
  - re-save A with `status => 'processing'`: `filed_at` and `filed_by` are
    unchanged (capture them before re-saving), `status = 'processing'`, and there are 2
    event rows;
  - save B with `'2026-736JEJ'`: the returned `duplicate_of` = `{A}`;
  - as `authenticated`, `select` from `gcc_filings` and from `gcc_filing_events`
    throws `42501`;
- [ ] **Step 2: Run** `npm run db:reset && npm run db:test`. Expected: the new file
  FAILs.
- [ ] **Step 3: Implement.** Normalise with `upper(btrim(p_complaint_id))`. Use
  `insert ... on conflict (report_id) do update`, setting only `complaint_id, status,
  note, updated_at, updated_by`. Treat a blank
  or whitespace `p_note` as null.
- [ ] **Step 4: Run** `npm run db:test`. Expected: all PASS.
- [ ] **Step 5: Commit** "Add gcc_filings tables and admin_save_gcc_filing RPC".

### Task 3: Queue, counts and history RPCs

**Files:**
- Create: `supabase/migrations/20261021100200_gcc_queue_rpcs.sql`
- Create: `supabase/tests/gcc_queue.test.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces:
  - `public.admin_gcc_queue(p_tab text, p_status public.gcc_status default null,
    p_limit int default 20, p_before timestamptz default null)` returns a table with
    these columns:
    - report fields: `id uuid, category public.report_category, subtype
      public.report_subtype, note text, lng float8, lat float8, created_at
      timestamptz, upvote_count int`;
    - reporter contact: `reporter_name text, reporter_phone text`;
    - `photo_paths text[]`;
    - filing fields: `complaint_id text, gcc_status public.gcc_status, gcc_note text,
      filed_at timestamptz, filing_updated_at timestamptz`;
    - `sort_key timestamptz`.
  - `public.admin_gcc_counts() returns table (unfiled int, filed int)`.
  - `public.admin_gcc_history(p_report_id uuid) returns table (complaint_id text,
    status public.gcc_status, note text, created_at timestamptz)`.

- [ ] **Step 1: Write the failing pgTAP test.** Fixtures:
  - open report U1, older open report U2 with no `report_contacts` row, and an open
    report U3 with a photo;
  - filed report F1 (`registered`) and filed report F2 (`processing`, updated later);
  - a hidden unfiled report H, a fixed unfiled report X, and a filed report FX that is
    then set `status = 'fixed'`.

  Assert:
  - every RPC refuses non-admins (`AUTH_REQUIRED`);
  - `p_tab => 'bogus'` → `INVALID_INPUT`;
  - unfiled ids in order are `{U3, U1, U2}` (newest `created_at` first), and H and X
    are absent;
  - U2 has null `reporter_name`;
  - U3's `photo_paths` holds its `storage_path`, with only `kind = 'report'` photos;
  - filed ids in order are `{F2, F1}` by `filing_updated_at` desc, and FX is absent;
  - `p_status => 'processing'` → `{F2}`;
  - `p_limit => 1` returns F2, then `p_before =>` that row's `sort_key` returns F1;
  - counts = `(3, 2)`;
  - history for F2 is oldest first.
- [ ] **Step 2: Run** `npm run db:test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `sort_key` is `created_at` for unfiled and
  `gcc_filings.updated_at` for filed. Keyset: `sort_key < p_before`. Clamp `p_limit` to
  1..100. Aggregate photos with `array_agg(storage_path order by created_at) filter
  (where kind = 'report')`.
- [ ] **Step 4: Run** `npm run db:test && npm run db:types && npm run typecheck`.
  Expected: all PASS, and the types include `admin_gcc_queue` and `gcc_status`.
- [ ] **Step 5: Commit** "Add admin GCC queue, counts and history RPCs and regenerate DB
  types".

### Task 4: Pure helpers, the RPC client and i18n strings

**Files:**
- Create: `src/lib/admin/complaintIdFormat.ts` and `complaintIdFormat.test.ts`
- Create: `src/lib/admin/formatForGcc.ts` and `formatForGcc.test.ts`
- Create: `src/lib/admin/gccApi.ts` and `gccApi.test.ts`
- Modify: `src/lib/i18n/messages/en.json`

**Interfaces:**
- Consumes: the generated `Database` types (Task 3).
- Produces:
  - `normaliseComplaintId(raw: string): string`, which trims and uppercases;
  - `looksLikeGccComplaintId(id: string): boolean`, using the format regex;
  - `GCC_STATUSES: readonly GccStatus[]`, in the order from Global Constraints;
  - `type GccStatus = Database['public']['Enums']['gcc_status']`;
  - `type QueueRow` = the `admin_gcc_queue` Row type;
  - `formatDescription(row: QueueRow): string`;
  - `formatAll(row: QueueRow, mapsUrl: string): string`;
  - `mapsUrl(lat: number, lng: number): string` →
    `https://maps.google.com/?q=${lat},${lng}`;
  - `gccApi`:
    - `whoami(): Promise<boolean>`
    - `queue(args: { tab: 'unfiled' | 'filed'; status?: GccStatus; before?: string }): Promise<QueueRow[]>`
    - `counts(): Promise<{ unfiled: number; filed: number }>`
    - `save(args: { reportId: string; complaintId: string; status?: GccStatus; note?: string }): Promise<{ duplicateOf: string[] }>`
    - `history(reportId: string): Promise<HistoryRow[]>`

    Each method throws `GccApiError` with `.code: string`, taken from the PostgREST
    error `message` when it's one of the RPC codes, otherwise `'UNKNOWN'`.

- [ ] **Step 1: Write failing Vitest tests.**
  - `normaliseComplaintId(' 2026-736jej ') === '2026-736JEJ'`.
  - `looksLikeGccComplaintId('2026-736JEJ') === true`; `'2026736JEJ'` → false;
    `'ABC'` → false.
  - `GCC_STATUSES` equals the 8 codes in order.
  - `formatDescription` for a pothole row with note "Near bus stop" →
    `"Pothole — Near bus stop"`. For category `other` + subtype `open_manhole` and no
    note → `"Open manhole"`. Use the i18n labels.
  - `formatAll` includes the description, `13.06, 80.27`, the maps URL, name and
    phone, one per line, and `—` for null name or phone.
  - `gccApi.save` calls `rpc('admin_save_gcc_filing', { p_report_id, p_complaint_id,
    p_status, p_note })` with normalised ID and maps `duplicate_of`. It throws
    `GccApiError` with code `AUTH_REQUIRED` when the mocked rpc returns
    `{ error: { message: 'AUTH_REQUIRED' } }`. Mock `@/lib/supabase/browser` like
    `useReports.test.ts`.
- [ ] **Step 2: Run** `npm test -- src/lib/admin`. Expected: FAIL.
- [ ] **Step 3: Implement**, and add these `en.json` keys:
  - `admin.title` "GCC filing"
  - `admin.signIn.email` "Email"
  - `admin.signIn.send` "Send sign-in link"
  - `admin.signIn.sent` "Check your email and open the link in this same browser."
  - `admin.signIn.failed` "Couldn't send the link. Try again in a few minutes."
  - `admin.tab.unfiled` "Unfiled ({{count}})"
  - `admin.tab.filed` "Filed ({{count}})"
  - `admin.filter.all` "All"
  - `admin.gccStatus.<code>` for each code: Registered, Forwarded, Processing,
    Completed, Rejected, Reopened, Withdrawn, Not completed
  - `admin.card.reported` "Reported {{when}}"
  - `admin.card.upvotes` "+{{count}} people reported this"
  - `admin.card.openMaps` "Open in Google Maps"
  - `admin.card.noValue` "—"
  - `admin.copy.description` / `.coords` / `.maps` / `.name` / `.phone` / `.all`, and
    `admin.copy.done` "Copied"
  - `admin.form.complaintId` "GCC complaint ID"
  - `admin.form.complaintIdPlaceholder` "2026-736JEJ"
  - `admin.form.formatWarning` "This doesn't look like a GCC number (e.g.
    2026-736JEJ). Save anyway if it's right."
  - `admin.form.note` "Note (optional)"
  - `admin.form.status` "GCC status"
  - `admin.form.markFiled` "Mark as filed"
  - `admin.form.save` "Save"
  - `admin.form.edit` "Edit"
  - `admin.form.history` "History"
  - `admin.form.saved` "Saved · {{id}}"
  - `admin.form.duplicate` "This GCC number is also on {{count}} other report(s)."
  - `admin.form.filedOn` "Filed {{date}}"
  - `admin.form.updatedOn` "Updated {{date}}"
  - `admin.loadMore` "Load more"
  - `admin.refresh` "Refresh"
  - `admin.empty.unfiled` "Nothing left to file."
  - `admin.empty.filed` "No filed reports yet."
  - `admin.errors.AUTH_REQUIRED` "Your session isn't an admin session. Sign in again."
  - `admin.errors.INVALID_INPUT` "Check the complaint ID (3–40 characters) and note
    (up to 1000)."
- [ ] **Step 4: Run** `npm test -- src/lib/admin && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** "Add GCC admin helpers, RPC client and strings".

### Task 5: Report card and filing form

**Files:**
- Create: `src/components/admin/CopyButton.tsx`
- Create: `src/components/admin/GccFilingForm.tsx` and `GccFilingForm.test.tsx`
- Create: `src/components/admin/GccReportCard.tsx` and `GccReportCard.test.tsx`

**Interfaces:**
- Consumes: `QueueRow`, `gccApi`, the helpers and `GCC_STATUSES` (Task 4).
- Produces:
  - `CopyButton({ text, label }: { text: string; label: string })`. It uses
    `navigator.clipboard.writeText` and shows `admin.copy.done` for 1.5 s.
  - `GccFilingForm({ row, onSaved }: { row: QueueRow; onSaved: (row: QueueRow) => void })`.
  - `GccReportCard({ row, onSaved }: { row: QueueRow; onSaved: (row: QueueRow) => void })`.
    Photo URLs come from `getBrowserClient().storage.from('report-photos').getPublicUrl(path)`.

- [ ] **Step 1: Write failing Testing Library tests.**
  - Card: a row with null `reporter_name` and `reporter_phone` renders `—` twice and
    doesn't throw; `upvote_count` 14 renders "+14 people reported this"; the maps link
    href is `https://maps.google.com/?q=13.06,80.27`; clicking "Copy all" calls
    `clipboard.writeText` with `formatAll(...)`.
  - Form, unfiled row: shows the complaint ID input and "Mark as filed". With empty
    input, the button is disabled. Typing `abc` shows the format warning but leaves the
    button enabled. Submitting calls `gccApi.save` with `{ reportId, complaintId: 'abc',
    status: 'registered' }` and then `onSaved`. When `save` rejects with code
    `INVALID_INPUT`, the `admin.errors.INVALID_INPUT` text is shown.
  - Form, filed row: shows the ID, "Filed …" and "Edit". Edit reveals a status
    `<select>` with 8 options. "History" calls `gccApi.history` and lists the entries.
    A `duplicateOf` of length 1 shows the duplicate notice.
- [ ] **Step 2: Run** `npm test -- src/components/admin`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mobile-first, using the Tailwind tokens already in use
  (`bg-surface`, `text-muted`, `text-foreground`). Render relative dates with
  `Intl.RelativeTimeFormat` and absolute dates with `Intl.DateTimeFormat('en-IN',
  { day: 'numeric', month: 'short' })`.
- [ ] **Step 4: Run** `npm test -- src/components/admin && npm run lint`. Expected:
  PASS.
- [ ] **Step 5: Commit** "Add GCC report card and filing form".

### Task 6: `/admin` page with magic-link gate, tabs and queue

**Files:**
- Create: `src/app/admin/page.tsx` (server component: exports `metadata = { title:
  'GCC filing', robots: { index: false, follow: false } }` and renders `<AdminApp />`)
- Create: `src/components/admin/AdminApp.tsx` (client; the gate)
- Create: `src/components/admin/GccQueue.tsx` (client; tabs, filter, list, load more,
  refresh)
- Create: `src/components/admin/AdminApp.test.tsx` and `GccQueue.test.tsx`
- Possibly modify: `src/components/auth/SessionProvider.tsx` and its test (see Step 3)

**Interfaces:**
- Consumes: `gccApi`, `GccReportCard`, `GCC_STATUSES`.
- Produces: `AdminApp()` and `GccQueue()`, both with no props.

- [ ] **Step 1: Write failing tests.**
  - `AdminApp`:
    - when `whoami` → false, it shows the email field and "Send sign-in link";
    - submitting `a@b.com` calls `auth.signInWithOtp({ email: 'a@b.com', options:
      { emailRedirectTo: <origin>/admin } })` and then shows the
      `admin.signIn.sent` text;
    - when `signInWithOtp` returns an error, it shows `admin.signIn.failed`;
    - when `whoami` → true, it renders `GccQueue`;
    - there's no "not authorised" state.
  - `GccQueue`:
    - on mount it calls `counts()` and `queue({ tab: 'unfiled' })` and shows the tab
      labels with counts;
    - switching to Filed calls `queue({ tab: 'filed' })` and shows the 9 filter chips;
    - choosing "Processing" calls `queue({ tab: 'filed', status: 'processing' })`;
    - "Load more" calls `queue` with `before` = the last row's `sort_key`;
    - when a card in Unfiled reports `onSaved`, it is removed from the list and counts
      refetch;
    - an empty list shows the empty text for that tab.
- [ ] **Step 2: Run** `npm test -- src/components/admin`. Expected: FAIL.
- [ ] **Step 3: Implement.** Before writing:
  - check `node_modules/next/dist/docs/` for the `metadata` export and the
    `'use client'` boundary;
  - confirm the browser client completes the PKCE `?code=` exchange on `/admin` (by
    default in `@supabase/ssr`). Once auth reports `SIGNED_IN`, re-run `whoami`.

  `SessionProvider` signs users in anonymously. It must only do so when there is no
  session at all, so it doesn't overwrite the magic-link session. If it doesn't behave
  that way, fix it there with a test.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** "Add /admin page with magic-link gate and GCC queue".

### Task 7: Spec sync and end-to-end check

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-chennai-road-grievance-mvp-design.md`
  - §5: add the `gcc_filings` and `gcc_filing_events` tables, and the five `admin_*` RPCs plus `is_admin` to the
    RPC table (auth column "admin");
  - §6: add `app/admin/page.tsx` and `components/admin/`.

- [ ] **Step 1: Edit the spec sections** listed above.
- [ ] **Step 2: Full verification.** Run `npm run db:reset && npm run db:test && npm
  test && npm run lint && npm run typecheck`. Expected: all PASS.
- [ ] **Step 3: Manual smoke test** (needs local Supabase; the magic-link email arrives in
  the local mail inbox at http://127.0.0.1:54324). Go through this sequence:
  1. Open `/admin`, sign in, and see the Unfiled queue.
  2. File one report as `2026-736jej`. Expected: the toast reads "Saved · 2026-736JEJ"
     and the card moves to Filed.
  3. Change its status to Processing and check that History shows 2 entries.
  4. In a private window, open `/admin` and request a link for a different email.
     Expected: after signing in, it still shows only the email form, never the queue.

  If any step can't be run, record it as skipped. Don't claim it passed.
- [ ] **Step 4: Commit** "Document GCC filing admin in the MVP spec".

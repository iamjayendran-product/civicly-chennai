# Civicly Chennai

Mobile-first PWA where citizens report potholes and other road issues in the Chennai
Metropolitan Area (CMDA); reports appear live on a public map for everyone.

**Source of truth for scope and design:**
`docs/superpowers/specs/2026-09-21-chennai-road-grievance-mvp-design.md`.
Read it before starting any feature. If a change contradicts the spec, update the spec
in the same PR (or ask first).

@AGENTS.md

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS v4 — `src/`
  (Next 16 differs from older versions: check `node_modules/next/dist/docs/` before
  using an API, per AGENTS.md)
- Supabase: Postgres + PostGIS, Realtime, Storage, Auth — `supabase/`
- MapLibre GL JS + OpenStreetMap vector tiles
- Vitest (unit), pgTAP (database), Playwright (e2e)
- Package manager: **npm**. Node 24.

## Commands

```bash
npm run dev            # Next.js dev server
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest
npm run test:e2e       # Playwright (needs local Supabase running)
npm run db:start       # local Supabase (requires Docker Desktop)
npm run db:reset       # re-apply migrations + seed
npm run db:test        # pgTAP tests
npm run db:types       # regenerate src/lib/supabase/database.types.ts
```

Docker is not installed on the primary dev machine yet — install Docker Desktop for
local Supabase, or point `.env.local` at a hosted Supabase dev project.

## Architecture rules (non-negotiable)

1. **Business rules live in Postgres.** Boundary check, rate limits, dedupe, vote
   thresholds, and all writes go through `security definer` RPC functions in
   `supabase/migrations/`. RLS denies direct inserts/updates on domain tables. Never
   re-implement or bypass these in Next.js API routes.
2. **Everyone has a session.** The app silently signs in anonymously (with a Turnstile
   token). Reporting and confirming "same issue" (+1, via `confirm_same_issue`) both
   work for anonymous users — no Google-linked account required (product decision,
   2026-09-25; the original spec required one for +1, this simplifies it to match
   `create_report`'s own bar). Flag, confirm-fixed, comments and push still require a
   Google-linked (non-anonymous) user.
3. **Realtime is the source of map updates.** The map loads via `reports_in_bbox` and
   then applies Realtime `INSERT`/`UPDATE` events on `reports`. No polling.
4. **CMDA only.** Any location outside the CMDA polygon is rejected server-side
   (`OUTSIDE_CMDA`). The client clamps the map to the CMDA extent.
5. **Privacy by default.** Photos are resized, EXIF-stripped (re-encode) and
   face/plate-blurred on-device before upload. Never store raw IPs — only salted
   hashes. Never show reporter identity on reports.
6. **Typed error codes.** RPCs raise `P0001` with a code string (`OUTSIDE_CMDA`,
   `RATE_LIMITED`, `INVALID_PHOTOS`, `INVALID_INPUT`, `AUTH_REQUIRED`); the UI maps
   codes to messages in the i18n catalog.
7. **All user-facing strings go through `src/lib/i18n`** (English only for MVP; Tamil
   comes later — don't hard-code strings in components).

## Out of scope for MVP

Don't build these without a spec change: Tamil UI, admin dashboard, severity ratings,
forwarding to GCC or other authorities, official accounts, video, native apps, phone
OTP, SMS/email notifications.

## Conventions

- TDD: write the failing test first (Vitest for TS, pgTAP for SQL).
- Migrations are append-only: never edit a migration that has been committed; add a
  new one. Name: `YYYYMMDDHHMMSS_short_description.sql`.
- Regenerate DB types after every migration change and commit them.
- Secrets only in `.env.local` (git-ignored). `SUPABASE_SERVICE_ROLE_KEY`,
  `VAPID_PRIVATE_KEY` and `PUSH_WEBHOOK_SECRET` must never be imported into client
  components.
- Keep files small and single-purpose; see the structure in spec §6.
- Commit messages: imperative mood, e.g. `Add create_report RPC with CMDA check`.

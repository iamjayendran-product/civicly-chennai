# src/ — Next.js PWA

See spec §6 for the full tree.

## Boundaries

- `lib/supabase/` — the only place that creates Supabase clients
  (`browser.ts`, `server.ts`) and holds generated `database.types.ts`. Components call
  hooks/functions, never `createClient` directly.
- `lib/images/` — pure `processPhoto(file: File): Promise<ProcessedPhoto>` pipeline
  (orient → resize ≤1600px → blur faces/plates → JPEG re-encode). No Supabase or React
  imports. Blur failure falls back to unblurred with `blurred: false`.
- `lib/realtime/` — `useReports(bbox, filters)` hook: bbox fetch via RPC + Realtime
  subscription merge. Map components consume only this hook.
- `lib/i18n/` — `t(key)` + `messages/en.json`. Every user-facing string and every RPC
  error code has a key here.
- `components/map/` — MapLibre rendering only; no data fetching.
- `components/auth/` — anonymous session bootstrap (Turnstile), Google One Tap,
  `SignInPrompt` shown when an action needs a non-anonymous user.

## Conventions

- Server Components by default; add `"use client"` only for map, camera, auth widgets.
- Mobile-first Tailwind; design for 360px width, thumb-reachable primary actions
  (bottom sheets, bottom-right FAB for "Report").
- Map coordinates are `[lng, lat]` everywhere (MapLibre + PostGIS order).
- Never import server-only env vars into files under a `"use client"` boundary; server
  code that needs them imports `server-only`.
- Co-locate unit tests as `*.test.ts(x)` next to the file.

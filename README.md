# Civicly Chennai

Mobile-first PWA for reporting potholes and road issues in the Chennai Metropolitan
Area, shown live on a public map.

- Design spec: `docs/superpowers/specs/2026-09-21-chennai-road-grievance-mvp-design.md`
- Contributor/agent guidance: `CLAUDE.md`

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Local Supabase needs Docker Desktop: `npm run db:start`, then `npm run db:reset`.
Alternatively point `.env.local` at a hosted Supabase dev project.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:start` / `db:reset` / `db:test` | Local Supabase, migrations + seed, pgTAP |
| `npm run db:types` | Regenerate Supabase TypeScript types |

## Deployment

Deployed on Vercel (project name: `civicly-chennai`), backed by a hosted Supabase
project. Vercel runs `next build` on every push — there's no server to manage.

### One-time setup

1. **Supabase production project** — create one at supabase.com (separate from your
   local dev project), then apply migrations and seed data to it:
   ```bash
   npx supabase link --project-ref <production-project-ref>
   npx supabase db push --include-seed --linked
   ```
   `--include-seed` matters: it loads `supabase/seed.sql`, which seeds
   `public.cmda_boundary`. Without it, the `OUTSIDE_CMDA` boundary check has nothing
   to check against and every report submission fails.

2. **Vercel project** — either `npx vercel link` from the repo root, or connect the
   GitHub repo directly in the Vercel dashboard (Import Project → this repo). Name
   the project `civicly-chennai`. No `vercel.json` is needed; this is a standard
   Next.js App Router app.

3. **Environment variables** — add every variable from `.env.example` to the Vercel
   project (Settings → Environment Variables), scoped to Production:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     — from the production Supabase project's API settings. Never add the
     `NEXT_PUBLIC_` prefix to the service role key.
   - `NEXT_PUBLIC_MAP_STYLE_URL` — a MapTiler style URL (with key) or a self-hosted
     Protomaps style.
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — a real Cloudflare Turnstile site key. The
     local dev fallback (`1x00000000000000000000AA`) always renders a visible
     "for testing only" widget — don't ship that key to production.
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — for Google One Tap sign-in.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET` — from
     `npx web-push generate-vapid-keys`.

   `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so set
   them before the first deploy; adding one afterward needs a redeploy to take
   effect.

4. **Deploy** — push to `main`, or click Deploy in the Vercel dashboard. Every push
   to `main` redeploys production; every pull request gets its own preview URL.

### CI

`.github/workflows/ci.yml` runs lint, typecheck, and the Vitest suite on every push
and pull request. It intentionally skips the Playwright e2e suite (needs a local
Supabase instance) — Vercel's own git integration handles the production build.

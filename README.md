# Chennai Road Grievance

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

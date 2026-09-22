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

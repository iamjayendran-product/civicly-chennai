import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `MapView.tsx` points maplibre-gl at `/maplibre-gl-worker.mjs` because the library's
// own `import.meta.url`-derived worker URL resolves to "" under Next's bundler, so the
// worker never starts and the map renders blank with zero tile requests. The two files
// under `public/` are byte-copies of maplibre-gl's own build output; if a version bump
// ever leaves them stale, the failure mode is that same silent blank map. These tests
// turn that into a loud `npm test` failure instead.

// Vitest runs with the project root as cwd; `import.meta.url` is not a file: URL under
// the jsdom environment, so it can't be used to locate the repo here.
const repoRoot = process.cwd();

const VENDORED_FILES = [
  ['public/maplibre-gl-worker.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'],
  ['public/maplibre-gl-shared.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'],
] as const;

describe('vendored maplibre-gl worker files', () => {
  it.each(VENDORED_FILES)('%s is byte-identical to %s', (vendored, source) => {
    const vendoredBytes = readFileSync(join(repoRoot, vendored));
    const sourceBytes = readFileSync(join(repoRoot, source));
    expect(
      vendoredBytes.equals(sourceBytes),
      `${vendored} is stale. Re-copy it: cp ${source} ${vendored}`
    ).toBe(true);
  });

  it('pins maplibre-gl to an exact version so the vendored copies cannot silently desync', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const range: string = pkg.dependencies['maplibre-gl'];
    expect(range).toMatch(/^\d+\.\d+\.\d+$/);

    const installed = JSON.parse(
      readFileSync(join(repoRoot, 'node_modules/maplibre-gl/package.json'), 'utf8')
    );
    expect(installed.version).toBe(range);
  });
});

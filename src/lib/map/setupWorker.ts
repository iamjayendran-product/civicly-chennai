import * as maplibregl from 'maplibre-gl';

let configured = false;

// maplibre-gl resolves its default worker script URL from `import.meta.url` inside its own
// package, which Next's webpack dev bundler does not expose as a real http(s) URL — the library
// silently falls back to an empty string and the worker never starts (verified: Worker is
// constructed with url `""`, so zero tile requests ever fire). `public/maplibre-gl-worker.mjs`
// is a checked-in copy of `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`; re-copy it
// after any maplibre-gl version bump.
//
// Shared by every component that constructs a maplibregl.Map (the real MapView and the
// gate's decorative background map) so it only needs setting once per page load.
export function configureMaplibreWorker() {
  if (configured || typeof window === 'undefined') return;
  configured = true;
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

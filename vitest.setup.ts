import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-registers its own cleanup when a global `afterEach`
// exists, which this project doesn't have (`globals: true` is off). Without this,
// every rendered component stays mounted in `document.body` for the rest of the
// file and leaks into later tests' queries.
afterEach(() => {
  cleanup();
});

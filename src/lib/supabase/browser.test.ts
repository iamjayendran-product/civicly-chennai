import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

describe('getBrowserClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the same client instance on repeated calls', async () => {
    const { getBrowserClient } = await import('./browser');
    const first = getBrowserClient();
    const second = getBrowserClient();
    expect(first).toBe(second);
  });
});

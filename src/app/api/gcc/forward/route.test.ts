// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const forwardBatch = vi.fn();
vi.mock('@/lib/gcc/forwardBatch', () => ({ forwardBatch: (...args: unknown[]) => forwardBatch(...args) }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => ({ rpc: vi.fn(), storage: { from: vi.fn() } }) }));

import { POST } from './route';

function request(secret?: string) {
  return new Request('http://localhost/api/gcc/forward', {
    method: 'POST',
    headers: secret ? { 'x-gcc-forward-secret': secret } : {},
  });
}

beforeEach(() => {
  forwardBatch.mockReset();
  forwardBatch.mockResolvedValue({ claimed: 1, submitted: 1, failed: 0 });
  vi.stubEnv('GCC_FORWARD_SECRET', 's3cret-value');
  vi.stubEnv('GCC_FORWARDING_ENABLED', 'true');
  vi.stubEnv('GCC_BASE_URL', 'https://gcc.example');
  vi.stubEnv('SITE_URL', 'https://civicly.example');
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/gcc/forward', () => {
  it('rejects a request without the shared secret', async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(forwardBatch).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const response = await POST(request('nope'));
    expect(response.status).toBe(401);
    expect(forwardBatch).not.toHaveBeenCalled();
  });

  it('rejects every request when no secret is configured', async () => {
    vi.stubEnv('GCC_FORWARD_SECRET', '');
    const response = await POST(request(''));
    expect(response.status).toBe(401);
  });

  it('does nothing while forwarding is switched off', async () => {
    vi.stubEnv('GCC_FORWARDING_ENABLED', 'false');
    const response = await POST(request('s3cret-value'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: 'GCC_FORWARDING_ENABLED is off' });
    expect(forwardBatch).not.toHaveBeenCalled();
  });

  it('forwards a batch and reports the outcome', async () => {
    const response = await POST(request('s3cret-value'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, submitted: 1, failed: 0 });
    expect(forwardBatch).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: 'https://civicly.example' }), 5);
  });
});

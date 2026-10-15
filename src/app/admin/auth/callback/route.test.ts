// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const exchangeCodeForSession = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => ({ auth: { exchangeCodeForSession } }) }));

import { GET } from './route';

beforeEach(() => exchangeCodeForSession.mockReset());

describe('GET /admin/auth/callback', () => {
  it('exchanges the magic-link code for a session and goes to /admin', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new Request('http://localhost:3000/admin/auth/callback?code=abc'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin');
  });

  it('sends the admin back to sign-in when the link is missing or invalid', async () => {
    const missing = await GET(new Request('http://localhost:3000/admin/auth/callback'));
    expect(missing.headers.get('location')).toBe('http://localhost:3000/admin/login?error=link');

    exchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } });
    const expired = await GET(new Request('http://localhost:3000/admin/auth/callback?code=old'));
    expect(expired.headers.get('location')).toBe('http://localhost:3000/admin/login?error=link');
  });
});

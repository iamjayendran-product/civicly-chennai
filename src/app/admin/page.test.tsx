import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => ({ rpc }) }));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('@/components/admin/GccQueue', () => ({ GccQueue: () => null }));

import AdminPage from './page';

beforeEach(() => {
  rpc.mockReset();
  redirect.mockClear();
});

describe('/admin', () => {
  it('sends anyone who is not an admin to sign-in', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(AdminPage()).rejects.toThrow('REDIRECT /admin/login');
    expect(rpc).toHaveBeenCalledWith('is_admin');
  });

  it('treats an error checking admin status as not an admin', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });
    await expect(AdminPage()).rejects.toThrow('REDIRECT /admin/login');
  });

  it('renders the GCC filing queue for an admin', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const element = await AdminPage();
    expect(element).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});

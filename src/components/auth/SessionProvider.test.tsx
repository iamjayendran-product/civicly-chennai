import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { user: { id: 'anon-user-1' } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    auth: { signInAnonymously, getSession },
  }),
}));

import { SessionProvider, useSession } from './SessionProvider';

function Probe() {
  const { userId, loading } = useSession();
  if (loading) return <div>loading</div>;
  return <div>user:{userId}</div>;
}

describe('SessionProvider', () => {
  beforeEach(() => {
    signInAnonymously.mockClear();
    getSession.mockClear();
  });

  it('signs in anonymously when there is no existing session, then exposes the user id', async () => {
    render(
      <SessionProvider turnstileToken="test-token">
        <Probe />
      </SessionProvider>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('user:anon-user-1')).toBeInTheDocument());
    expect(signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'test-token' } });
  });
});

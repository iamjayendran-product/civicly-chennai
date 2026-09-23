import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { user: { id: 'anon-user-1' } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    auth: { signInAnonymously, getSession },
  }),
}));

// next/script never runs onLoad in jsdom, so stand in for it with a component that
// fires onLoad once on mount — that's the only path that reaches handleTurnstileLoad.
// Exactly once, like the real thing: `onLoad` is a fresh closure on every render, so
// re-firing it would spin forever against any handler that sets state.
vi.mock('next/script', async () => {
  const React = await import('react');
  return {
    default: function MockScript({ onLoad }: { onLoad?: () => void }) {
      const fired = React.useRef(false);
      const latest = React.useRef(onLoad);
      latest.current = onLoad;
      React.useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        latest.current?.();
      }, []);
      return null;
    },
  };
});

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
    delete window.turnstile;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.turnstile;
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

  it('renders the Turnstile widget and bootstraps with the token the callback hands back', async () => {
    const render_ = vi.fn((_container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => {
      options.callback('cf-token');
      return 'widget-1';
    });
    window.turnstile = { render: render_ };

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText('user:anon-user-1')).toBeInTheDocument());
    expect(signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'cf-token' } });
    // `size` must not be passed: Turnstile only accepts normal/compact/flexible and
    // throws on anything else, which is what used to kill the whole bootstrap.
    expect(render_.mock.calls[0][1]).not.toHaveProperty('size');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces AUTH_REQUIRED when turnstile.render throws instead of hanging on loading', async () => {
    window.turnstile = {
      render: vi.fn(() => {
        throw new Error('Invalid value for parameter "size"');
      }),
    };

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t('errors.AUTH_REQUIRED')));
    expect(screen.getByText('user:')).toBeInTheDocument();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('surfaces AUTH_REQUIRED when the turnstile callback never fires', async () => {
    vi.useFakeTimers();
    // A widget that renders fine but never calls back.
    window.turnstile = { render: vi.fn(() => 'widget-1') };

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.AUTH_REQUIRED'));
    expect(screen.getByText('user:')).toBeInTheDocument();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

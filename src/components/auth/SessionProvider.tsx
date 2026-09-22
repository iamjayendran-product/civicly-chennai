'use client';

import Script from 'next/script';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

interface SessionState {
  userId: string | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ userId: null, loading: true });

export function useSession() {
  return useContext(SessionContext);
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; size: string; callback: (token: string) => void }) => string;
    };
  }
}

export function SessionProvider({
  children,
  turnstileToken,
}: {
  children: React.ReactNode;
  /** Test-only escape hatch: skips rendering the real Turnstile widget. */
  turnstileToken?: string;
}) {
  const [state, setState] = useState<SessionState>({ userId: null, loading: true });
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  async function bootstrap(captchaToken: string) {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const supabase = getBrowserClient();
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user.id) {
      setState({ userId: existing.session.user.id, loading: false });
      return;
    }
    const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    setState({ userId: error ? null : (data.user?.id ?? null), loading: false });
  }

  useEffect(() => {
    if (turnstileToken) {
      // bootstrap sets state only after an internal `await`, never synchronously
      // within this effect; the lint rule can't see that from the call site.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void bootstrap(turnstileToken);
    }
  }, [turnstileToken]);

  function handleTurnstileLoad() {
    if (turnstileToken || !widgetContainerRef.current || !window.turnstile) return;
    window.turnstile.render(widgetContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      size: 'invisible',
      callback: (token: string) => void bootstrap(token),
    });
  }

  return (
    <SessionContext.Provider value={state}>
      {!turnstileToken && (
        <>
          <div ref={widgetContainerRef} />
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            onLoad={handleTurnstileLoad}
          />
        </>
      )}
      {children}
    </SessionContext.Provider>
  );
}

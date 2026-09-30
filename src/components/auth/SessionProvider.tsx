'use client';

import Script from 'next/script';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';

// Cloudflare's dummy "always passes" test sitekey, invisible variant — unlike
// '1x00000000000000000000AA' (also always-passes but forces a visible "Verifying..."
// banner), this renders no UI at all. Swap for a real sitekey before launch; until
// then this keeps local/preview environments working without a Cloudflare account.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000BB';

/**
 * How long to wait for Turnstile's callback before telling the user the session
 * isn't ready. A managed widget normally resolves in well under a second; this is
 * only here so a widget that never calls back can't leave `loading` true forever.
 * If the token does arrive later, `bootstrap` still runs and clears the notice.
 */
const TURNSTILE_CALLBACK_TIMEOUT_MS = 15_000;

interface SessionState {
  userId: string | null;
  loading: boolean;
  /** A user-facing message from the i18n catalog, or null when nothing is wrong. */
  error: string | null;
}

const SessionContext = createContext<SessionState>({ userId: null, loading: true, error: null });

export function useSession() {
  return useContext(SessionContext);
}

declare global {
  interface Window {
    turnstile?: {
      // `size` is deliberately absent: Turnstile's render() only accepts
      // "normal" | "compact" | "flexible", and invisible mode is a property of the
      // widget in the Cloudflare dashboard, not a render() argument.
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
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
  const [state, setState] = useState<SessionState>({ userId: null, loading: true, error: null });
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCallbackTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function bootstrap(captchaToken: string) {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    // Inlined rather than calling clearCallbackTimeout(): bootstrap is referenced from
    // an effect below, and calling another locally-defined function from it defeats the
    // hooks lint's stability inference.
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const supabase = getBrowserClient();
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user.id) {
      // getSession() returns whatever is cached locally without confirming the server
      // still honors it. A session left over from before the local database was reset
      // (which wipes auth.refresh_tokens) can still look valid here, but every
      // subsequent API call made with it gets rejected with 401 — which surfaced as a
      // generic "Something went wrong" on report submission, since a 401's message
      // doesn't match any of our typed error codes. getUser() re-validates against the
      // server before we trust a cached session.
      const { data: verified, error: verifyError } = await supabase.auth.getUser();
      if (!verifyError && verified.user) {
        setState({ userId: verified.user.id, loading: false, error: null });
        return;
      }
      await supabase.auth.signOut();
    }
    const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    setState({
      userId: error ? null : (data.user?.id ?? null),
      loading: false,
      error: error ? t('errors.AUTH_REQUIRED') : null,
    });
  }

  function failSessionBootstrap() {
    clearCallbackTimeout();
    if (bootstrapped.current) return;
    setState({ userId: null, loading: false, error: t('errors.AUTH_REQUIRED') });
  }

  useEffect(() => {
    if (turnstileToken) {
      // bootstrap sets state only after an internal `await`, never synchronously
      // within this effect; the lint rule can't see that from the call site.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void bootstrap(turnstileToken);
    }
  }, [turnstileToken]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    []
  );

  function handleTurnstileLoad() {
    if (turnstileToken || bootstrapped.current) return;
    if (!widgetContainerRef.current || !window.turnstile) {
      failSessionBootstrap();
      return;
    }
    try {
      window.turnstile.render(widgetContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => void bootstrap(token),
      });
    } catch {
      // render() rejects bad options (and a bad sitekey) by throwing. Without this the
      // callback below never fires and the app sits on `loading` forever, silently.
      failSessionBootstrap();
      return;
    }
    clearCallbackTimeout();
    timeoutRef.current = setTimeout(failSessionBootstrap, TURNSTILE_CALLBACK_TIMEOUT_MS);
  }

  return (
    <SessionContext.Provider value={state}>
      {!turnstileToken && (
        <>
          <div ref={widgetContainerRef} />
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            onLoad={handleTurnstileLoad}
            onError={failSessionBootstrap}
          />
        </>
      )}
      {state.error && (
        <div role="alert" className="bg-warning/15 px-4 py-2 text-sm text-warning">
          {state.error}
        </div>
      )}
      {children}
    </SessionContext.Provider>
  );
}

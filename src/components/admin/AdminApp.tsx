'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/browser';
import { gccApi } from '@/lib/admin/gccApi';
import { GccQueue } from './GccQueue';

type Gate = 'checking' | 'signIn' | 'admin';

// UI gate only: every admin RPC re-checks is_admin() in Postgres. A non-admin who signs
// in just sees the email form again (spec §3).
export function AdminApp() {
  const [gate, setGate] = useState<Gate>('checking');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<'sent' | 'failed' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      gccApi.whoami().then((isAdmin) => {
        if (!cancelled) setGate(isAdmin ? 'admin' : 'signIn');
      });
    };
    check();
    // The magic link lands back here; the browser client exchanges the code and fires
    // SIGNED_IN, at which point the admin check needs to run again.
    const { data } = getBrowserClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') check();
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { error } = await getBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setSending(false);
    setNotice(error ? 'failed' : 'sent');
  }

  if (gate === 'checking') return null;

  if (gate === 'admin') {
    return (
      <main className="flex-1 overflow-y-auto bg-background">
        <GccQueue />
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background p-4">
      <form onSubmit={sendLink} className="w-full max-w-sm space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
        <h1 className="text-xl font-bold">{t('admin.title')}</h1>
        <label className="block text-xs text-muted">
          {t('admin.signIn.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <button type="submit" disabled={sending} className="w-full rounded-full bg-primary py-2 text-sm font-semibold text-white disabled:opacity-50">
          {t('admin.signIn.send')}
        </button>
        {notice === 'sent' && <p role="status" className="text-sm">{t('admin.signIn.sent')}</p>}
        {notice === 'failed' && <p role="alert" className="text-sm text-red-600">{t('admin.signIn.failed')}</p>}
      </form>
    </main>
  );
}

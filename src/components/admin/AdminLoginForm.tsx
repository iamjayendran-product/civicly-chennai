'use client';

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';

type State = 'idle' | 'sending' | 'sent' | 'failed';

/** Email magic-link sign-in for allowlisted admins. Never creates accounts; the admin
 * user is created once in the Supabase dashboard. */
export function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    const { error } = await getBrowserClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin/auth/callback` },
    });
    // An unknown email (no account, signups off) answers exactly like a sent link, so
    // this form can't be used to discover who has an account. Only a genuine send
    // failure (rate limit, server error) is surfaced.
    const unknownEmail = error && (error.status === 422 || error.status === 400);
    setState(!error || unknownEmail ? 'sent' : 'failed');
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">{t('admin.login.title')}</h1>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.login.email')}
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="rounded-xl border border-line bg-surface p-2"
        />
      </label>
      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-xl bg-primary py-2.5 font-medium text-white disabled:opacity-50"
      >
        {state === 'sending' ? t('admin.login.sending') : t('admin.login.send')}
      </button>
      {state === 'sent' && <p className="text-sm text-muted">{t('admin.login.sent')}</p>}
      {state === 'failed' && <p className="text-sm text-primary">{t('admin.login.failed')}</p>}
    </form>
  );
}

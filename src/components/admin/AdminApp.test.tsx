import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';

const signInWithOtp = vi.fn();
vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    auth: {
      signInWithOtp,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

const whoami = vi.fn();
vi.mock('@/lib/admin/gccApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/gccApi')>()),
  gccApi: { whoami: () => whoami() },
}));
vi.mock('./GccQueue', () => ({ GccQueue: () => <div>queue</div> }));

import { AdminApp } from './AdminApp';

beforeEach(() => {
  signInWithOtp.mockReset();
  whoami.mockReset();
});

describe('AdminApp', () => {
  it('asks for an email when the session is not the admin', async () => {
    whoami.mockResolvedValue(false);
    render(<AdminApp />);
    expect(await screen.findByLabelText(t('admin.signIn.email'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.signIn.send') })).toBeInTheDocument();
    expect(screen.queryByText('queue')).not.toBeInTheDocument();
  });

  it('emails a magic link that returns to /admin, then says to check email', async () => {
    whoami.mockResolvedValue(false);
    signInWithOtp.mockResolvedValue({ error: null });
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText(t('admin.signIn.email')), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.signIn.send') }));

    expect(await screen.findByText(t('admin.signIn.sent'))).toBeInTheDocument();
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
  });

  it('says the link could not be sent when Supabase refuses', async () => {
    whoami.mockResolvedValue(false);
    signInWithOtp.mockResolvedValue({ error: { message: 'rate limited' } });
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText(t('admin.signIn.email')), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.signIn.send') }));
    expect(await screen.findByText(t('admin.signIn.failed'))).toBeInTheDocument();
  });

  it('opens straight into the queue for the admin', async () => {
    whoami.mockResolvedValue(true);
    render(<AdminApp />);
    expect(await screen.findByText('queue')).toBeInTheDocument();
    expect(screen.queryByLabelText(t('admin.signIn.email'))).not.toBeInTheDocument();
  });
});

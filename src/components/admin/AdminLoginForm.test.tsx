import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';

const signInWithOtp = vi.fn();
vi.mock('@/lib/supabase/browser', () => ({ getBrowserClient: () => ({ auth: { signInWithOtp } }) }));

import { AdminLoginForm } from './AdminLoginForm';

beforeEach(() => signInWithOtp.mockReset());

describe('AdminLoginForm', () => {
  it('emails a magic link without ever creating an account', async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByLabelText(t('admin.login.email')), { target: { value: ' IamJayendran@gmail.com ' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.login.send') }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled());
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'iamjayendran@gmail.com',
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin/auth/callback` },
    });
    expect(await screen.findByText(t('admin.login.sent'))).toBeInTheDocument();
  });

  it('gives the same answer for an email that is not an admin (no account enumeration)', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp', status: 422 } });
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByLabelText(t('admin.login.email')), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.login.send') }));
    expect(await screen.findByText(t('admin.login.sent'))).toBeInTheDocument();
  });

  it('reports a failure to send, e.g. rate limiting', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded', status: 429 } });
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByLabelText(t('admin.login.email')), { target: { value: 'iamjayendran@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.login.send') }));
    expect(await screen.findByText(t('admin.login.failed'))).toBeInTheDocument();
  });
});

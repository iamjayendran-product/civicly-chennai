import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

// The admin magic link lands here with a one-time ?code= (PKCE); exchanging it sets the
// session cookies, replacing the anonymous session this browser had.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/admin', url.origin));
  }
  return NextResponse.redirect(new URL('/admin/login?error=link', url.origin));
}

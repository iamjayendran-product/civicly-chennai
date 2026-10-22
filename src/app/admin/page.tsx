import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { GccQueue } from '@/components/admin/GccQueue';

export const metadata: Metadata = {
  title: 'GCC filing',
  robots: { index: false, follow: false },
};

// GCC filing log. The gate here only decides what to render; every admin RPC the queue
// calls re-checks is_admin() in the database.
export default async function AdminPage() {
  const supabase = await getServerClient();
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) redirect('/admin/login');

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <GccQueue />
    </main>
  );
}

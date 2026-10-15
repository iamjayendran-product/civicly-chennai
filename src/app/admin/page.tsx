import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { t } from '@/lib/i18n';

// Admin review screen. The gate here only decides what to render; every admin RPC the
// table calls re-checks is_admin() in the database.
export default async function AdminPage() {
  const supabase = await getServerClient();
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) redirect('/admin/login');

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:px-6">
        <h1 className="text-lg font-semibold">{t('admin.title')}</h1>
      </header>
      <AdminReportsTable />
    </main>
  );
}

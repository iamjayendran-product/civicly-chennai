import { getBrowserClient } from '@/lib/supabase/browser';
import type { Database } from '@/lib/supabase/database.types';

// Thin wrappers over the admin_* RPCs (20261015130000_admin_review migration). Every one
// is gated server-side by is_admin(); these only shape arguments and results.

type Functions = Database['public']['Functions'];
export type AdminReport = Functions['admin_list_reports']['Returns'][number];
export type ReporterReport = Functions['admin_reporter_reports']['Returns'][number];
export type FlagResult = Functions['admin_flag_reports']['Returns'][number];
export type AdminFilter = 'pending' | 'flagged' | 'filed' | 'failed' | 'all';
export type FlagReason = 'spam' | 'duplicate' | 'not_road_issue' | 'abusive_photo' | 'other';

export interface ListParams {
  filter: AdminFilter;
  search?: string;
  ward?: string;
  before?: string | null;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listReports({ filter, search, ward, before }: ListParams): Promise<AdminReport[]> {
  const result = await getBrowserClient().rpc('admin_list_reports', {
    p_filter: filter,
    p_search: (search?.trim() || null) as string,
    p_ward: (ward?.trim() || null) as string,
    p_before: (before ?? null) as string,
    p_limit: 50,
  });
  return unwrap(result) ?? [];
}

export async function reporterReports(reportId: string): Promise<ReporterReport[]> {
  return unwrap(await getBrowserClient().rpc('admin_reporter_reports', { p_report_id: reportId })) ?? [];
}

export async function flagReports(ids: string[], reason: FlagReason | null = null): Promise<FlagResult[]> {
  const result = await getBrowserClient().rpc('admin_flag_reports', { p_report_ids: ids, p_reason: reason as string });
  return unwrap(result) ?? [];
}

export async function setFlagReason(id: string, reason: FlagReason): Promise<void> {
  unwrap(await getBrowserClient().rpc('admin_set_flag_reason', { p_report_id: id, p_reason: reason }));
}

export async function unflagReports(ids: string[]): Promise<void> {
  unwrap(await getBrowserClient().rpc('admin_unflag_reports', { p_report_ids: ids }));
}

export async function retryGcc(id: string): Promise<void> {
  unwrap(await getBrowserClient().rpc('admin_retry_gcc', { p_report_id: id }));
}

export function photoUrl(path: string): string {
  return getBrowserClient().storage.from('report-photos').getPublicUrl(path).data.publicUrl;
}

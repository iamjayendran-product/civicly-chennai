import { getBrowserClient } from '@/lib/supabase/browser';
import type { Database } from '@/lib/supabase/database.types';
import { normaliseComplaintId } from './complaintIdFormat';

type Fns = Database['public']['Functions'];
export type GccStatus = Database['public']['Enums']['gcc_status'];

export const GCC_STATUSES: readonly GccStatus[] = [
  'registered', 'forwarded', 'processing', 'completed',
  'rejected', 'reopened', 'withdrawn', 'not_completed',
];

// The generated Row type marks every column non-null; these are null for unfiled
// reports, reports without a contact row, or reports without a note/subtype.
type GeneratedQueueRow = Fns['admin_gcc_queue']['Returns'][number];
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
export type QueueRow = Nullable<
  GeneratedQueueRow,
  | 'subtype' | 'note' | 'reporter_name' | 'reporter_phone'
  | 'complaint_id' | 'gcc_status' | 'gcc_note' | 'filed_at' | 'filing_updated_at'
  | 'reporter_gender' | 'gcc_street_id' | 'gcc_road_name' | 'gcc_zone' | 'gcc_ward' | 'landmark'
>;
export type HistoryRow = Nullable<Fns['admin_gcc_history']['Returns'][number], 'note'>;

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'INVALID_INPUT'];

export class GccApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'GccApiError';
  }
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) {
    throw new GccApiError(RPC_ERROR_CODES.includes(error.message) ? error.message : 'UNKNOWN');
  }
  return data as T;
}

export const gccApi = {
  async queue(args: { tab: 'unfiled' | 'filed'; status?: GccStatus; before?: string }): Promise<QueueRow[]> {
    const params: Fns['admin_gcc_queue']['Args'] = { p_tab: args.tab };
    if (args.status) params.p_status = args.status;
    if (args.before) params.p_before = args.before;
    return unwrap(await getBrowserClient().rpc('admin_gcc_queue', params)) as QueueRow[];
  },

  async counts(): Promise<{ unfiled: number; filed: number }> {
    const rows = unwrap(await getBrowserClient().rpc('admin_gcc_counts'));
    return rows[0] ?? { unfiled: 0, filed: 0 };
  },

  async save(args: { reportId: string; complaintId: string; status?: GccStatus; note?: string }): Promise<{ duplicateOf: string[] }> {
    const params: Fns['admin_save_gcc_filing']['Args'] = {
      p_report_id: args.reportId,
      p_complaint_id: normaliseComplaintId(args.complaintId),
    };
    if (args.status) params.p_status = args.status;
    if (args.note !== undefined) params.p_note = args.note;
    const rows = unwrap(await getBrowserClient().rpc('admin_save_gcc_filing', params));
    return { duplicateOf: rows[0]?.duplicate_of ?? [] };
  },

  // Soft delete: hides the report from the public map and the queue.
  async deleteReport(reportId: string): Promise<void> {
    unwrap(await getBrowserClient().rpc('admin_delete_report', { p_report_id: reportId }));
  },

  async history(reportId: string): Promise<HistoryRow[]> {
    return unwrap(await getBrowserClient().rpc('admin_gcc_history', { p_report_id: reportId })) as HistoryRow[];
  },
};

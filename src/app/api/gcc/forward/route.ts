import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { getServiceClient } from '@/lib/supabase/service';
import { forwardBatch } from '@/lib/gcc/forwardBatch';
import { registerGccComplaint } from '@/lib/gcc/client';
import { toGccImageDataUrl } from '@/lib/gcc/photo';
import type { ClaimedSubmission } from '@/lib/gcc/buildPayload';

// Called every 5 minutes by pg_cron (public.trigger_gcc_forward) with a shared secret.
// Files due reports with GCC's grievance portal; see the 20261015110000_gcc_forwarding
// migration for the queue rules.

const BATCH_SIZE = 5;
// Five GCC calls, each up to 30 s (plus one image-less retry), with pauses between.
export const maxDuration = 300;

function secretMatches(given: string | null): boolean {
  const expected = process.env.GCC_FORWARD_SECRET ?? '';
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('x-gcc-forward-secret'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (process.env.GCC_FORWARDING_ENABLED !== 'true') {
    return Response.json({ skipped: 'GCC_FORWARDING_ENABLED is off' });
  }

  const supabase = getServiceClient();
  const siteUrl = process.env.SITE_URL ?? '';
  const baseUrl = process.env.GCC_BASE_URL || 'https://gccservices.in';
  const photos = supabase.storage.from('report-photos');

  const summary = await forwardBatch(
    {
      siteUrl,
      claim: async (limit) => {
        const { data, error } = await supabase.rpc('claim_gcc_submissions', { p_limit: limit });
        if (error) throw new Error(`claim_gcc_submissions failed: ${error.message}`);
        return (data ?? []) as ClaimedSubmission[];
      },
      loadPhoto: async (path) => {
        const { data, error } = await photos.download(path);
        if (error || !data) return null;
        return toGccImageDataUrl(new Uint8Array(await data.arrayBuffer()));
      },
      publicPhotoUrl: (path) => photos.getPublicUrl(path).data.publicUrl,
      send: (fields) => registerGccComplaint(fields, { baseUrl, siteUrl }),
      record: async (reportId, complaintNumber, error) => {
        const result = await supabase.rpc('record_gcc_result', {
          p_report_id: reportId,
          p_complaint_number: complaintNumber as string,
          p_error: error as string,
        });
        if (result.error) console.error('[gcc forward] record_gcc_result failed:', result.error);
      },
      pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    BATCH_SIZE
  );
  return Response.json(summary);
}

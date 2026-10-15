import 'server-only';
import { buildGccPayload, type ClaimedSubmission } from './buildPayload';
import type { RegisterResult } from './client';

export interface ForwardDeps {
  claim: (limit: number) => Promise<ClaimedSubmission[]>;
  /** The report photo as a data: URL under 1 MB, or null if there is none. */
  loadPhoto: (path: string) => Promise<string | null>;
  publicPhotoUrl: (path: string) => string;
  send: (fields: Record<string, string>) => Promise<RegisterResult>;
  record: (reportId: string, complaintNumber: string | null, error: string | null) => Promise<void>;
  pause: (ms: number) => Promise<void>;
  siteUrl: string;
}

const PAUSE_BETWEEN_MS = 3_000;

/** Claim due reports and file each with GCC, one at a time. Every claimed report gets a
 * recorded outcome (complaint number or error), so the queue's retry/backoff applies. */
export async function forwardBatch(deps: ForwardDeps, limit: number) {
  const rows = await deps.claim(limit);
  let submitted = 0;
  for (const [index, row] of rows.entries()) {
    if (index > 0) await deps.pause(PAUSE_BETWEEN_MS);
    try {
      let image: string | null = null;
      if (row.photo_path) {
        // A photo problem shouldn't stop the complaint: it is still filed, with a link.
        image = await deps.loadPhoto(row.photo_path).catch(() => null);
      }
      const photoUrl = row.photo_path ? deps.publicPhotoUrl(row.photo_path) : null;
      let result = await deps.send(buildGccPayload(row, { siteUrl: deps.siteUrl, photoUrl, imageDataUrl: image }));
      // GCC's own form never actually sends a photo (it posts "#"), so an inline image is
      // the least-trodden path on their side: if it's rejected, file once more without it.
      if (!result.ok && image) {
        result = await deps.send(buildGccPayload(row, { siteUrl: deps.siteUrl, photoUrl, imageDataUrl: null }));
      }
      if (result.ok) {
        submitted++;
        await deps.record(row.report_id, result.complaintNumber, null);
      } else {
        await deps.record(row.report_id, null, result.error);
      }
    } catch (error) {
      await deps.record(row.report_id, null, error instanceof Error ? error.message : String(error));
    }
  }
  return { claimed: rows.length, submitted, failed: rows.length - submitted };
}

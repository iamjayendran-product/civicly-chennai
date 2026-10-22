// GCC complaint numbers look like `2026-736JEJ`. Other GCC channels may differ, so the
// format check only drives a soft warning in the UI; the server checks length alone.
const GCC_COMPLAINT_ID = /^\d{4}-\d{3}[A-Z]{3}$/;

export function normaliseComplaintId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function looksLikeGccComplaintId(id: string): boolean {
  return GCC_COMPLAINT_ID.test(id);
}

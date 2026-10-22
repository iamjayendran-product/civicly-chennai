import 'server-only';

export type RegisterResult = { ok: true; complaintNumber: string } | { ok: false; error: string };

interface RegisterOptions {
  /** GCC portal origin, e.g. https://gccservices.in (GCC_BASE_URL; a stub in tests). */
  baseUrl: string;
  /** Civicly's public origin, named in the User-Agent so GCC can identify the sender. */
  siteUrl: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

/** POST one complaint to GCC's register endpoint — the call GCC's own complaint form makes
 * (form-encoded, like its jQuery $.ajax). GCC answers with { complaintNumber }. */
export async function registerGccComplaint(
  fields: Record<string, string>,
  { baseUrl, siteUrl, fetchImpl = fetch, timeoutMs = 30_000 }: RegisterOptions
): Promise<RegisterResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/pgr/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': `CivicilyChennai/1.0 (+${siteUrl})`,
        Accept: 'application/json, text/plain, */*',
      },
      body: new URLSearchParams(fields).toString(),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `GCC responded HTTP ${response.status}` };
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
      // GCC's own page also handles a JSON string wrapped in a string.
      if (typeof body === 'string') body = JSON.parse(body);
    } catch {
      return { ok: false, error: `GCC returned a non-JSON response: ${text.slice(0, 120)}` };
    }
    const raw = (body as { complaintNumber?: unknown } | null)?.complaintNumber;
    const complaintNumber = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    if (!complaintNumber || complaintNumber.toLowerCase() === 'null' || complaintNumber === 'N/A') {
      return { ok: false, error: `GCC returned no complaint number: ${text.slice(0, 120)}` };
    }
    return { ok: true, complaintNumber };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

import { describe, it, expect, vi } from 'vitest';
import { registerGccComplaint } from './client';

const fields = { ComplainantName: 'Asha', MobileNo: '', ComplaintType: '112' };

function respond(body: string, status = 200) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(body, { status })));
}

describe('registerGccComplaint', () => {
  it('posts the fields form-encoded to GCC’s register endpoint with an identifying User-Agent', async () => {
    const fetchImpl = respond(JSON.stringify({ complaintNumber: '2026-48213' }));
    await registerGccComplaint(fields, { baseUrl: 'https://gcc.example', siteUrl: 'https://civicly.example', fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://gcc.example/pgr/api/register');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded; charset=UTF-8');
    expect(headers.get('user-agent')).toBe('CivicilyChennai/1.0 (+https://civicly.example)');
    expect(new URLSearchParams(String(init?.body)).get('ComplainantName')).toBe('Asha');
    expect(new URLSearchParams(String(init?.body)).get('MobileNo')).toBe('');
  });

  it('returns the complaint number GCC issues', async () => {
    const fetchImpl = respond(JSON.stringify({ complaintNumber: '2026-48213' }));
    expect(await registerGccComplaint(fields, { baseUrl: 'https://gcc.example', siteUrl: 's', fetchImpl })).toEqual({
      ok: true,
      complaintNumber: '2026-48213',
    });
  });

  it('accepts a numeric complaint number', async () => {
    const fetchImpl = respond(JSON.stringify({ complaintNumber: 48213 }));
    expect(await registerGccComplaint(fields, { baseUrl: 'b', siteUrl: 's', fetchImpl })).toEqual({ ok: true, complaintNumber: '48213' });
  });

  it.each([
    ['a missing number', JSON.stringify({ status: 'ok' })],
    ['a "null" number', JSON.stringify({ complaintNumber: 'null' })],
    ['a non-JSON body', '<html>Error</html>'],
  ])('treats %s as a failure', async (_label, body) => {
    const result = await registerGccComplaint(fields, { baseUrl: 'b', siteUrl: 's', fetchImpl: respond(body) });
    expect(result.ok).toBe(false);
  });

  it('reports the HTTP status on an error response', async () => {
    const result = await registerGccComplaint(fields, { baseUrl: 'b', siteUrl: 's', fetchImpl: respond('busy', 502) });
    expect(result).toEqual({ ok: false, error: 'GCC responded HTTP 502' });
  });

  it('reports network failures', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const result = await registerGccComplaint(fields, { baseUrl: 'b', siteUrl: 's', fetchImpl });
    expect(result).toEqual({ ok: false, error: 'fetch failed' });
  });
});

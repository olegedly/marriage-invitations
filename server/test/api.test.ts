/**
 * Seam T2: the HTTP API.
 *
 * Exercised through Fastify's inject(), so real routing, validation and
 * serialisation are covered without opening a socket. The PDF renderer is
 * injected so these tests never launch a browser.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { openHistory, type History } from '../src/history.js';
import type { PdfRenderer } from '../src/pdf.js';

let dir: string;
let history: History;
let app: Awaited<ReturnType<typeof buildApp>>;

/** A renderer that returns recognisable bytes without launching Chromium. */
const fakePdf: PdfRenderer = async () => Buffer.from('%PDF-1.4 stub content');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    guests: 'Loimie',
    language: 'en',
    number: 'singular',
    register: 'formal',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    ...overrides,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'invitations-api-'));
  history = openHistory(join(dir, 'history.sqlite'));
  app = await buildApp({ history, renderPdf: fakePdf });
});

afterEach(async () => {
  await app.close();
  history.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/generate', () => {
  test('returns a PDF attachment with a deterministic filename', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(
      'Invitation_Loimie_EN.pdf',
    );
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('succeeds for a Cyrillic guest name', async () => {
    // A raw non-ASCII byte in a header makes Node throw ERR_INVALID_CHAR,
    // which previously turned every Russian invitation into a 500.
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ guests: 'Семья Ивановых', language: 'ru' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const header = res.headers['content-disposition'] as string;
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
  });

  test('records the generation so it appears in history', async () => {
    await app.inject({ method: 'POST', url: '/api/generate', payload: validBody() });

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    const entries = res.json();

    expect(entries).toHaveLength(1);
    expect(entries[0].guests).toBe('Loimie');
  });

  test('rejects a request with no guest name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ guests: '' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('rejects an unknown language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ language: 'fr' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('rejects an unknown country rather than guessing a timezone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ countryCode: 'ZZ' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('rejects an unknown number form', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ number: 'dual' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('returns 500 without leaking internals when rendering fails', async () => {    const broken = await buildApp({
      history,
      renderPdf: async () => {
        throw new Error('chromium exploded at /usr/bin/chrome');
      },
    });

    const res = await broken.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody(),
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('/usr/bin/chrome');
    await broken.close();
  });
});

describe('GET /api/history', () => {
  test('is empty initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('GET /api/history/:id', () => {
  test('returns the stored markdown for a past generation', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ personalNote: 'See you there!' }),
    });
    const [entry] = (await app.inject({ method: 'GET', url: '/api/history' })).json();

    const res = await app.inject({ method: 'GET', url: `/api/history/${entry.id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().markdown).toContain('See you there!');
  });

  test('404s for an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history/nope' });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/history/:id/pdf', () => {
  test('re-renders a stored invitation as a PDF', async () => {
    await app.inject({ method: 'POST', url: '/api/generate', payload: validBody() });
    const [entry] = (await app.inject({ method: 'GET', url: '/api/history' })).json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('Invitation_Loimie_EN.pdf');
  });

  test('404s for an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history/nope/pdf' });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/countries', () => {
  test('lists selectable countries with shortlist entries first', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/countries' });
    const countries = res.json();

    expect(res.statusCode).toBe(200);
    expect(countries.length).toBeGreaterThan(5);

    const firstNonShortlist = countries.findIndex((c: { shortlist?: boolean }) => !c.shortlist);
    const lastShortlist = countries.map((c: { shortlist?: boolean }) => !!c.shortlist).lastIndexOf(true);
    expect(lastShortlist).toBeLessThan(firstNonShortlist === -1 ? countries.length : firstNonShortlist);
  });

  test('includes Poland, which was requested explicitly', async () => {
    const countries = (await app.inject({ method: 'GET', url: '/api/countries' })).json();

    expect(countries.some((c: { code: string }) => c.code === 'PL')).toBe(true);
  });
});

describe('GET /api/calendar.ics', () => {
  test('serves a downloadable calendar file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/calendar.ics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('.ics');
    expect(res.body).toContain('BEGIN:VCALENDAR');
  });
});

describe('static client', () => {
  test('serves the SPA shell at the root', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });

    // In tests the client build may be absent; either the shell or a clear 404.
    expect([200, 404]).toContain(res.statusCode);
  });
});

describe('calendar link origin', () => {
  test('uses the Host the request arrived on, with no configuration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: { host: 'our-wedding.example' },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(200);

    // The stored markdown is what gets rendered into the PDF, so the link is
    // asserted there rather than in the (faked) PDF bytes.
    const entry = history.list()[0]!;
    const stored = history.get(entry.id)!;
    expect(stored.markdown).toContain('http://our-wedding.example/api/calendar.ics');
  });

  test('honors X-Forwarded-* when behind a reverse proxy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: {
        host: 'internal-service:3000',
        'x-forwarded-host': 'invites.example.org',
        'x-forwarded-proto': 'https',
      },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(200);

    const stored = history.get(history.list()[0]!.id)!;
    expect(stored.markdown).toContain('https://invites.example.org/api/calendar.ics');
    // The internal host must not leak into a guest-facing link.
    expect(stored.markdown).not.toContain('internal-service');
  });

  test('never emits a relative calendar link', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: { host: 'our-wedding.example' },
      payload: validBody(),
    });

    const stored = history.get(history.list()[0]!.id)!;
    expect(stored.markdown).not.toMatch(/\]\(\/api\/calendar\.ics\)/);
  });
});

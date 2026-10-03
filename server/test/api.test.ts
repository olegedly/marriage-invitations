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
import { EVENT, type EventConstants } from '../src/event.js';
import { openHistory, type History } from '../src/history.js';
import type { PdfRenderer } from '../src/pdf.js';

let dir: string;
let history: History;
let app: Awaited<ReturnType<typeof buildApp>>;

/** A renderer that returns recognisable bytes without launching Chromium. */
const fakePdf: PdfRenderer = async () => Buffer.from('%PDF-1.4 stub content');

/**
 * A renderer that keeps the markdown it is handed, so a test can see what the
 * PDF would contain without launching a browser.
 */
function capturingPdf(): { render: PdfRenderer; markdowns: string[] } {
  const markdowns: string[] = [];
  return {
    markdowns,
    render: async (markdown) => {
      markdowns.push(markdown);
      return Buffer.from('%PDF-1.4 stub content');
    },
  };
}

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

  test('rejects an unknown photo frame rather than drawing a default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ photoShape: 'hexagonal' }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/photo shape/i);
  });

  test('defaults an omitted frame to the arch', async () => {
    // A tab left open across a redeploy sends the payload it was built with.
    // The frame is the one choice that can stand in for itself: it changes the
    // look, never the words, so a default is safe where one for a language or a
    // tone would not be.
    const withoutShape = validBody();
    delete (withoutShape as Record<string, unknown>).photoShape;

    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: withoutShape,
    });

    expect(res.statusCode).toBe(200);
    expect(history.list()[0]!.photoShape).toBe('arched');
  });

  test('stores the chosen frame with the record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ photoShape: 'rectangular' }),
    });

    expect(res.statusCode).toBe(200);
    expect(history.list()[0]!.photoShape).toBe('rectangular');
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

describe('GET /api/history/:id/pdf/current', () => {
  test('re-renders a past invitation from its stored choices', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ personalNote: 'Still counts!' }),
    });
    const [entry] = (await app.inject({ method: 'GET', url: '/api/history' })).json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf/current`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('Invitation_Loimie_EN.pdf');
  });

  test('404s for an unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/history/nope/pdf/current',
    });

    expect(res.statusCode).toBe(404);
  });

  test('keeps the guest choices the entry was generated with', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody({ guests: 'Máté', personalNote: 'Bring cake!' }),
    });
    const [entry] = (await app.inject({ method: 'GET', url: '/api/history' })).json();

    const capture = capturingPdf();
    const reread = await buildApp({ history, renderPdf: capture.render });

    const res = await reread.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf/current`,
    });

    expect(res.statusCode).toBe(200);
    const rendered = capture.markdowns.at(-1)!;
    expect(rendered).toContain('Máté');
    expect(rendered).toContain('Bring cake!');
    await reread.close();
  });

  test('builds the calendar link from the origin serving this request', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: { host: 'first.example' },
      payload: validBody(),
    });
    const [entry] = (await app.inject({ method: 'GET', url: '/api/history' })).json();

    const capture = capturingPdf();
    const reread = await buildApp({ history, renderPdf: capture.render });

    const res = await reread.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf/current`,
      headers: { host: 'second.example' },
    });

    expect(res.statusCode).toBe(200);
    const rendered = capture.markdowns.at(-1)!;
    expect(rendered).toContain('http://second.example/api/calendar.ics');
    expect(rendered).not.toContain('first.example');
    // The stored record still keeps the origin it was generated on.
    expect(history.get(entry.id)!.markdown).toContain(
      'http://first.example/api/calendar.ics',
    );
    await reread.close();
  });
});

describe('history downloads after a redeploy changes the constants', () => {
  // Two complete sets of constants stand in for two deploys: the guest choices
  // in history are identical, but the call link and a Facebook URL have moved.
  const before: EventConstants = {
    ...EVENT,
    zoomLink: 'https://call.example/old-room',
    groom: { ...EVENT.groom, facebook: 'https://facebook.com/old-oleg' },
  };
  const after: EventConstants = {
    ...EVENT,
    zoomLink: 'https://call.example/new-room',
    groom: { ...EVENT.groom, facebook: 'https://facebook.com/new-oleg' },
  };

  /** Generate one invitation under the given constants, leaving it in history. */
  async function generateUnder(event: EventConstants): Promise<string> {
    const capture = capturingPdf();
    const generationApp = await buildApp({ history, renderPdf: capture.render, event });
    await generationApp.inject({
      method: 'POST',
      url: '/api/generate',
      payload: validBody(),
    });
    await generationApp.close();
    return capture.markdowns[0]!;
  }

  test('the updated download reflects the constants in force now', async () => {
    await generateUnder(before);

    const capture = capturingPdf();
    const redeployed = await buildApp({ history, renderPdf: capture.render, event: after });
    const [entry] = (await redeployed.inject({ method: 'GET', url: '/api/history' })).json();

    const res = await redeployed.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf/current`,
    });

    expect(res.statusCode).toBe(200);
    const rendered = capture.markdowns.at(-1)!;
    expect(rendered).toContain('https://call.example/new-room');
    expect(rendered).toContain('https://facebook.com/new-oleg');
    expect(rendered).not.toContain('https://call.example/old-room');
    await redeployed.close();
  });

  test('the original download still serves exactly what was generated', async () => {
    const generated = await generateUnder(before);

    const capture = capturingPdf();
    const redeployed = await buildApp({ history, renderPdf: capture.render, event: after });
    const [entry] = (await redeployed.inject({ method: 'GET', url: '/api/history' })).json();

    const res = await redeployed.inject({
      method: 'GET',
      url: `/api/history/${entry.id}/pdf`,
    });

    expect(res.statusCode).toBe(200);
    expect(capture.markdowns.at(-1)).toBe(generated);
    await redeployed.close();
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

  test('serves the whole world, not just a shortlist', async () => {
    const countries = (await app.inject({ method: 'GET', url: '/api/countries' })).json();
    const byCode = new Map(countries.map((c: { code: string }) => [c.code, c]));

    // Germany and Nigeria were both absent when only the curated table existed.
    expect(byCode.get('DE')).toMatchObject({ name: 'Germany', offset: 'UTC+2' });
    expect(byCode.has('NG')).toBe(true);
    // Multi-zone rows carry an abbreviation for the picker instead.
    expect(byCode.get('US-EASTERN')).toMatchObject({ abbr: 'ET' });
  });

  test('accepts a country that was never curated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ countryCode: 'DE' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().markdown).toContain('Germany time');
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

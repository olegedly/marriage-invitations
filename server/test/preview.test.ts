/**
 * Seam T2b: the text preview.
 *
 * The operator wants to read what the invitation SAYS before committing to a
 * PDF. That is the same renderer the PDF uses, so the preview cannot drift from
 * the artifact: it is markdown, not a second copy of the copy.
 *
 * Exercised through Fastify's inject() like the rest of the HTTP surface. No
 * PDF renderer is injected, which is the point — a preview must never launch
 * Chromium, and a test that needed one would fail loudly here.
 */

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { openHistory, type History } from '../src/history.js';

let dir: string;
let history: History;
let app: Awaited<ReturnType<typeof buildApp>>;

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
  dir = mkdtempSync(join(tmpdir(), 'invitations-preview-'));
  history = openHistory(join(dir, 'history.sqlite'));
  // Deliberately no renderPdf: a preview that reaches for a browser is a bug.
  app = await buildApp({ history });
});

afterEach(async () => {
  await app.close();
  history.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/preview', () => {
  test('returns the invitation text as JSON, not a PDF', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const body = res.json();
    expect(body.markdown).toContain('Dear **Loimie**');
    expect(body.filename).toBe('Invitation_Loimie_EN.pdf');
  });

  test('shows the same text the PDF would be built from', async () => {
    // A second, preview-only template is the failure this guards against: the
    // operator would approve wording that never reaches the guest.
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ guests: 'Máté and Szandra', countryCode: 'PH' }),
    });

    const { markdown } = res.json();
    expect(markdown).toContain('Máté and Szandra');
    expect(markdown).toContain('Oleg');
    expect(markdown).toContain('Rose');
  });

  test('renders the guest language, not English', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ language: 'ru', gender: 'feminine' }),
    });

    const { markdown } = res.json();
    expect(markdown).toContain('Уважаемая');
    expect(markdown).toContain('Приглашение на свадьбу');
  });

  test('does not save anything to history', async () => {
    // Previewing is not generating. A history full of abandoned drafts would
    // bury the invitations that were actually sent.
    await app.inject({ method: 'POST', url: '/api/preview', payload: validBody() });

    const res = await app.inject({ method: 'GET', url: '/api/history' });
    expect(res.json()).toEqual([]);
  });

  test('rejects invalid input the same way generation does', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ countryCode: 'ZZ' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('rejects an empty guest name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ guests: '   ' }),
    });

    expect(res.statusCode).toBe(400);
  });

  test('carries the couple’s own calendar link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      headers: { host: 'our-wedding.example' },
      payload: validBody(),
    });

    // Same renderer as the PDF path, so approving this text approves the link.
    expect(res.json().markdown).toContain('](https://calendar.app.google/');
  });

  test('includes the personal note when one is given', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: validBody({ personalNote: 'So glad you can make it!' }),
    });

    expect(res.json().markdown).toContain('So glad you can make it!');
  });
});

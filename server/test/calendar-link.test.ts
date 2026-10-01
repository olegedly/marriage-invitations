import { describe, expect, test } from 'vitest';
import { renderInvitation } from '../src/render.js';
import type { GenerationInput } from '../src/render.js';

/**
 * Seam T1c: the calendar link inside an invitation.
 *
 * A PDF has no base URL. When a guest opens it on their own machine there is
 * no origin to resolve a relative link against, and Chromium's PDF export
 * fills one in from its own throwaway local server — producing a
 * plausible-looking but dead `http://localhost:<random port>/...`.
 *
 * So the link must be absolute, and the origin must come from the request that
 * asked for the invitation rather than from a hardcoded constant. The constant
 * defaulted to `http://localhost:3000`, which is correct on exactly one machine
 * and silently wrong everywhere else.
 */

const base = (over: Partial<GenerationInput> = {}): GenerationInput => ({
  guests: 'Loimie',
  language: 'en',
  number: 'singular',
  register: 'formal',
  gender: 'neutral',
  countryCode: 'PH',
  personalNote: null,
  ...over,
});

describe('calendar link in the invitation', () => {
  test('is absolute against the origin the invitation was requested from', () => {
    const { markdown } = renderInvitation(base(), { baseUrl: 'https://our-wedding.example' });

    expect(markdown).toContain('https://our-wedding.example/api/calendar.ics');
  });

  test('never contains a bare relative calendar link', () => {
    const { markdown } = renderInvitation(base(), { baseUrl: 'https://our-wedding.example' });

    // A markdown link target of exactly "/api/calendar.ics" would be resolved
    // by the PDF renderer into a dead localhost URL.
    expect(markdown).not.toMatch(/\]\(\/api\/calendar\.ics\)/);
  });

  test('carries whatever origin it is given, including a port', () => {
    const { markdown } = renderInvitation(base(), { baseUrl: 'http://192.168.1.50:8080' });

    expect(markdown).toContain('http://192.168.1.50:8080/api/calendar.ics');
  });

  test('the zoom link is a separate absolute link and is unaffected', () => {
    const { markdown } = renderInvitation(base(), { baseUrl: 'https://our-wedding.example' });

    expect(markdown).toContain('](https://our-wedding.example/api/calendar.ics)');
    // The join CTA must still point at the configured conference link.
    expect(markdown).not.toMatch(/Join the ceremony\]\(https:\/\/our-wedding/);
  });
});

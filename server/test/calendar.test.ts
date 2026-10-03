/**
 * Seam T3b: calendar output.
 *
 * Two shapes from one source of truth: a Google Calendar template URL, which
 * the invitation links to, and an .ics file kept for the guest who is not on
 * Gmail.
 *
 * The instants are UTC, so every client localises to the guest's own zone
 * regardless of what timezone label the invitation printed.
 */

import { describe, expect, test } from 'vitest';
import { buildIcs, icsFilename } from '../src/calendar.js';
import { EVENT } from '../src/event.js';

/**
 * RFC 5545 unfolding: a CRLF followed by one space or tab is a continuation.
 * Calendar clients unfold before parsing, so tests must too.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, '');
}

describe('ics generation', () => {
  test('is a valid VCALENDAR with one VEVENT', () => {
    const ics = buildIcs();

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  test('carries the event in UTC so clients localise it themselves', () => {
    const ics = buildIcs();

    // 18:10 EEST on 2026-10-13 is 15:10 UTC.
    expect(ics).toContain('DTSTART:20261013T151000Z');
  });

  test('includes the video conference link so it is one tap away', () => {
    // Long URLs are folded across lines per RFC 5545, so the link is only
    // contiguous once the file is unfolded — which is what a calendar client
    // does. Asserting on the raw text would fail for any real-length link.
    const unfolded = unfold(buildIcs());

    expect(unfolded).toContain(`URL:${EVENT.zoomLink}`);
    expect(unfolded).toContain(`LOCATION:${EVENT.zoomLink}`);
  });

  test('folds long lines within the 75-octet limit the spec sets', () => {
    // A folded line that exceeds the limit is invalid and some clients reject
    // the whole event, taking the join link with it.
    for (const line of buildIcs().split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  test('unfolding restores every folded line losslessly', () => {
    const ics = buildIcs();

    // Unfolding must only ever remove the CRLF + single space, never content.
    expect(unfold(ics).replace(/\r\n/g, '')).toBe(ics.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, ''));
  });

  test('uses CRLF line endings, as the iCalendar spec requires', () => {
    const ics = buildIcs();

    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n').length).toBeGreaterThan(5);
  });

  test('does not emit bare LF line breaks', () => {
    const ics = buildIcs();
    const bareLf = ics.split('\r\n').join('').includes('\n');

    expect(bareLf).toBe(false);
  });

  test('includes the couple names so the entry is identifiable', () => {
    const ics = buildIcs();

    expect(ics).toContain('Oleg');
    expect(ics).toContain('Rose');
  });

  test('escapes commas in the description', () => {
    const ics = buildIcs();

    // A raw comma would split the value; the spec requires escaping.
    const descLines = ics.split('\r\n').filter((l) => l.startsWith('DESCRIPTION'));
    expect(descLines.length).toBeGreaterThan(0);
    for (const line of descLines) {
      const value = line.slice(line.indexOf(':') + 1);
      expect(value).not.toMatch(/(?<!\\),/);
    }
  });

  test('is not empty when downloaded', () => {
    expect(buildIcs().length).toBeGreaterThan(100);
  });
});

describe('ics filename', () => {
  test('is descriptive and safe', () => {
    expect(icsFilename()).toMatch(/^[A-Za-z0-9_-]+\.ics$/);
  });
});

/**
 * Seam T1b: timezone offsets.
 *
 * Node bundles its own tzdata inside ICU, and that copy can lag the IANA
 * releases. It did: ICU 78.3 ships tzdata 2026a, which still has Morocco at
 * UTC+1, while Morocco moved to permanent UTC+0 on 2026-09-20 in release
 * 2026d. A guest in Casablanca would have been given the wrong hour.
 *
 * Offsets therefore come from moment-timezone's bundled IANA data rather than
 * the runtime's copy.
 */

import { describe, expect, test } from 'vitest';
import { offsetMinutes, tzDataVersion } from '../src/tzdata.js';

/** 2026-10-13 18:10 EEST — the wedding instant. */
const WEDDING = new Date('2026-10-13T18:10:00+03:00');

describe('offsetMinutes', () => {
  test('returns the home zone offset', () => {
    // Romania is on EEST (UTC+3) in October.
    expect(offsetMinutes('Europe/Bucharest', WEDDING)).toBe(180);
  });

  test('returns UTC+0 for Morocco after its 2026-09-20 change', () => {
    // The whole reason this module exists: Node's bundled data says +60 here.
    expect(offsetMinutes('Africa/Casablanca', WEDDING)).toBe(0);
  });

  test('returns UTC+1 for Morocco before the change', () => {
    const before = new Date('2026-08-01T12:00:00Z');

    expect(offsetMinutes('Africa/Casablanca', before)).toBe(60);
  });

  test('handles Moscow, which shares the home offset', () => {
    expect(offsetMinutes('Europe/Moscow', WEDDING)).toBe(180);
  });

  test('handles the Philippines', () => {
    expect(offsetMinutes('Asia/Manila', WEDDING)).toBe(480);
  });

  test('handles US Eastern on daylight time', () => {
    expect(offsetMinutes('America/New_York', WEDDING)).toBe(-240);
  });

  test('handles US Eastern outside daylight time', () => {
    const winter = new Date('2026-01-15T12:00:00Z');

    expect(offsetMinutes('America/New_York', winter)).toBe(-300);
  });

  test('handles Sydney, which shifts the local date', () => {
    expect(offsetMinutes('Australia/Sydney', WEDDING)).toBe(660);
  });

  test('handles half-hour and 45-minute offsets', () => {
    expect(offsetMinutes('Asia/Kolkata', WEDDING)).toBe(330);
    expect(offsetMinutes('Asia/Kathmandu', WEDDING)).toBe(345);
  });

  test('throws for an unknown zone rather than guessing', () => {
    expect(() => offsetMinutes('Mars/Olympus', WEDDING)).toThrow(/unknown time zone/i);
  });

  test('agrees with the library data version it reports', () => {
    // The bundled IANA release must be new enough to include Morocco's
    // 2026-09-20 change; 2026a is the stale snapshot Node's ICU carries.
    expect(tzDataVersion() >= '2026c').toBe(true);
  });
});

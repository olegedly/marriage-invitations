import { describe, expect, test } from 'vitest';
import { COUNTRY_ZONES, localTime } from '../src/timezone.js';
import { guestInput, render } from './support/render.js';
import type { GenerationInput } from '../src/render.js';

/** Philippines by default: the point of this suite is a guest zone that is not the couple's. */
const input = (over: Partial<GenerationInput> = {}): GenerationInput =>
  guestInput({ countryCode: 'PH', ...over });

/**
 * Seam T1b: guest-facing local times.
 *
 * The clock face and the offset label must come from the same timezone data.
 * They previously did not: the label used the library's IANA 2026d while the
 * clock face went through Intl, which reads Node's bundled ICU 2026a. For
 * Morocco those disagree by an hour, producing "16:10 — UTC+0".
 */

const WEDDING = new Date('2026-10-13T18:10:00+03:00');

describe('localTime', () => {
  test('renders the ceremony zone', () => {
    const t = localTime('Europe/Bucharest', 'en', WEDDING);

    expect(t.formatted).toContain('18:10');
    expect(t.offset).toBe('UTC+3');
  });

  test('renders Morocco as 15:10 UTC+0, not the stale ICU value', () => {
    const t = localTime('Africa/Casablanca', 'en', WEDDING);

    // Node's bundled ICU 2026a still has Morocco at +1 and would say 16:10.
    expect(t.formatted).toContain('15:10');
    expect(t.offset).toBe('UTC+0');
  });

  test('the clock face agrees with the offset label', () => {
    // The invariant that was broken: rendered hour and stated offset must
    // describe the same instant. Expected values are independent literals
    // (the event is 15:10 UTC), not recomputed from the offset label — that
    // would assert the code against itself and could never disagree with it.
    const expected: Record<string, string> = {
      'Europe/Bucharest': '18:10',
      'Africa/Casablanca': '15:10',
      'Asia/Manila': '23:10',
      'America/New_York': '11:10',
      'Europe/Moscow': '18:10',
      'Australia/Sydney': '02:10',
      'Asia/Kolkata': '20:40',
      'Asia/Kathmandu': '20:55',
    };

    for (const [zone, hhmm] of Object.entries(expected)) {
      expect(localTime(zone, 'en', WEDDING).formatted).toContain(hhmm);
    }
  });

  test('renders the rolled-over date for a guest a day ahead', () => {
    // Sydney is 02:10 the NEXT day. The date is simply part of the rendered
    // string — no separate "your date differs" flag is needed, and none is
    // computed. Each guest reads their own date and nothing else.
    const sydney = localTime('Australia/Sydney', 'en', WEDDING);

    expect(sydney.formatted).toContain('Wednesday');
    expect(sydney.formatted).toContain('14 October');

    const bucharest = localTime('Europe/Bucharest', 'en', WEDDING);
    expect(bucharest.formatted).toContain('Tuesday');
    expect(bucharest.formatted).toContain('13 October');
  });

  test('uses Cebuano month and weekday names', () => {
    const t = localTime('Asia/Manila', 'ceb', WEDDING);

    expect(t.formatted).toContain('Martes');
    expect(t.formatted).toContain('Oktubre');
  });

  test('uses Russian month names', () => {
    const t = localTime('Europe/Moscow', 'ru', WEDDING);

    expect(t.formatted).toContain('октября');
  });

  test('attaches a curated label only for its own zone', () => {
    expect(localTime('Europe/Moscow', 'ru', WEDDING).label).toBe('МСК');
    expect(localTime('Europe/Berlin', 'en', WEDDING).label).toBeUndefined();
  });

  test('no label names two offsets at once', () => {
    // Labels such as "EET/EEST" and "CET/CEST" name a standard time AND a
    // daylight time, so a guest cannot tell which one applies. The numeric
    // offset is rendered separately, so an ambiguous label is pure noise.
    for (const entry of COUNTRY_ZONES) {
      for (const label of Object.values(entry.label)) {
        expect(label).not.toMatch(/\w+\/\w+/);
      }
    }
  });

  test('labels identify a single resolvable zone', () => {
    // Every curated label must still be attached to exactly one zone, so the
    // right label can never leak onto a neighbouring country's invitation.
    const seen = new Map<string, string>();
    for (const entry of COUNTRY_ZONES) {
      const existing = seen.get(entry.zone);
      if (existing) {
        // Multi-zone countries are listed per zone; the label must match too.
        expect(entry.label).toEqual(COUNTRY_ZONES.find((c) => c.zone === existing)!.label);
      }
      seen.set(entry.zone, entry.name);
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});

/**
 * Language and country are independent axes.
 *
 * The country selects a timezone only; it never selects a language, and the
 * language never changes which country is named. These tests exist because the
 * two are easy to conflate when reading a table of results: "Romania" beside a
 * Russian string looks like a bug unless you know the invitation itself was
 * Russian.
 */
describe('language and country independence', () => {
  test('the same country renders its label in whichever language is chosen', () => {
    const expected: Record<string, string> = {
      en: 'Romania time',
      ru: 'время Румынии',
      ceb: 'oras sa Romania',
    };

    for (const [language, label] of Object.entries(expected)) {
      const t = localTime('Europe/Bucharest', language as 'en' | 'ru' | 'ceb', WEDDING);

      expect(t.label).toBe(label);
      // The offset itself is language-independent: same instant, same UTC+3.
      expect(t.offset).toBe('UTC+3');
    }
  });

  test('a country label is never taken from a different country', () => {
    // Romania's label must not appear for a Philippine guest, in any language.
    for (const language of ['en', 'ru', 'ceb'] as const) {
      const ph = localTime('Asia/Manila', language, WEDDING);

      expect(ph.label).not.toMatch(/Romania|Румыни/i);
    }
  });

  test('the whole invitation is in one language, regardless of country', () => {
    // A Romanian guest written to in Russian gets Russian copy AND a Russian
    // country label; nothing mixes.
    const { markdown } = render(
      input({ language: 'ru', countryCode: 'RO', guests: 'Анна' }),
    );

    expect(markdown).toContain('время Румынии');
    expect(markdown).toContain('октября');
    expect(markdown).not.toContain('Romania time');
    expect(markdown).not.toContain('October');
  });
});

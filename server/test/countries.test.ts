import { describe, expect, test } from 'vitest';
import { allCountries, zoneForCountry } from '../src/timezone.js';
import { ISO_COUNTRIES } from '../src/countries.js';
import { offsetMinutes } from '../src/tzdata.js';

/**
 * Seam T1b: the selectable-country registry.
 *
 * The curated list shipped 23 entries while the module claimed a fallback to
 * the full ISO list that was never written, so most of the world was simply
 * absent from the selector. These tests pin the selector to the ISO list.
 */

/** 2026-10-13 18:10 EEST — the wedding instant, for offset resolution. */
const WEDDING = new Date('2026-10-13T18:10:00+03:00');

describe('country registry', () => {
  test('offers every ISO 3166-1 country', () => {
    // A country is represented either by its own code ("DE") or by a per-zone
    // subdivision that declares it as its parent ("US-EASTERN" -> US).
    const represented = new Set(allCountries().map((c) => c.iso ?? c.code));

    const missing = ISO_COUNTRIES.filter((c) => !represented.has(c.code)).map((c) => c.code);

    expect(missing).toEqual([]);
  });

  test('resolves every ISO 3166-1 country, selectable by its own code or not', () => {
    const unresolved = ISO_COUNTRIES.filter((c) => !zoneForCountry(c.code)).map((c) => c.code);

    expect(unresolved).toEqual([]);
  });

  test('resolves a country the old curated list omitted', () => {
    // Germany is the worked example: not curated, but plainly a country a
    // guest could be in.
    const de = zoneForCountry('DE');

    expect(de?.name).toBe('Germany');
    expect(de?.zone).toBe('Europe/Berlin');
  });

  test('every selectable country names a zone the offset math accepts', () => {
    // A country whose zone moment-timezone does not know would throw at render
    // time, i.e. only once the operator asked for that guest's PDF.
    const unresolvable = allCountries().filter((c) => {
      try {
        offsetMinutes(c.zone, WEDDING);
        return false;
      } catch {
        return true;
      }
    });

    expect(unresolvable.map((c) => `${c.code}:${c.zone}`)).toEqual([]);
  });

  test('never lists the same code twice', () => {
    const codes = allCountries().map((c) => c.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  test('keeps multi-zone countries listed per zone, without a duplicate generic row', () => {
    const codes = allCountries().map((c) => c.code);

    // A guest in the United States picks a zone, not a redundant "United
    // States" row that would silently assume one.
    expect(codes).toContain('US-EASTERN');
    expect(codes).toContain('CA-PACIFIC');
    expect(codes).not.toContain('US');
    expect(codes).not.toContain('CA');
  });

  test('includes Kosovo, which is not in ISO 3166-1 but is a country', () => {
    const xk = allCountries().find((c) => c.code === 'XK');

    expect(xk).toMatchObject({ name: 'Kosovo', zone: 'Europe/Belgrade' });
  });

  test('pins the shortlist above the alphabetical rest', () => {
    const list = allCountries();
    const lastShortlist = list.map((c) => !!c.shortlist).lastIndexOf(true);
    const firstOther = list.findIndex((c) => !c.shortlist);

    expect(lastShortlist).toBeGreaterThanOrEqual(0);
    expect(lastShortlist).toBeLessThan(firstOther);
  });

  test('pins Georgia to the shortlist rather than leaving it in the alphabetical rest', () => {
    // Georgia was reachable through the ISO fallback, but only by scrolling:
    // it had no curated entry, so it carried no label of its own.
    const georgia = allCountries().find((c) => c.code === 'GE');

    expect(georgia).toMatchObject({
      name: 'Georgia',
      zone: 'Asia/Tbilisi',
      shortlist: true,
    });
    expect(georgia?.label.en).toBe('Georgia time');
    expect(georgia?.label.ru).toBe('время Грузии');
  });

  test('names Georgia in the guest language on the invitation, not just the picker', () => {
    // The label is what the time line prints, so a curated entry with an English
    // label would leak English into a Russian or Bisaya invitation.
    const ru = zoneForCountry('GE');
    expect(ru?.label.ru).toBe('время Грузии');
    expect(ru?.label.ceb).toBe('oras sa Georgia');
  });
});

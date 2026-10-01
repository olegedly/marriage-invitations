import { describe, expect, test } from 'vitest';
import { render, guestInput as input } from './support/render.js';

/**
 * Seam T1: render(input) -> { markdown, filename }
 *
 * Pure function. No PDF, no database, no HTTP. Expected values below are
 * worked examples taken from the spec, not recomputed the way the code does.
 */

describe('renderInvitation — English, one guest, formal', () => {
  test('addresses the guest by name and produces markdown', () => {
    const { markdown } = render(input());

    expect(markdown).toContain('Loimie');
    expect(markdown).toContain('Oleg');
    expect(markdown).toContain('Rose');
  });

  test('names the couple per language, not in a fixed script', () => {
    const { markdown } = render(input({ language: 'ru' }));

    expect(markdown).toContain('Олег');
    expect(markdown).toContain('Роуз');
    expect(markdown).not.toContain('Oleg');
  });

  test('links the couple names to their Facebook profiles', () => {
    const { markdown } = render(input());

    expect(markdown).toMatch(/\[Oleg\]\(https:\/\/www\.facebook\.com\/[^)]*\)/);
    expect(markdown).toMatch(/\[Rose\]\(https:\/\/www\.facebook\.com\/[^)]*\)/);
  });

  test('derives a deterministic, filesystem-safe filename', () => {
    expect(render(input()).filename).toBe('Invitation_Loimie_EN.pdf');
  });

  test('de-accents Hungarian guest names into the filename', () => {
    // The invited guests are Hungarian, so the slug path that strips
    // diacritics is exercised by real names rather than an ASCII stand-in.
    const { filename } = render(input({ guests: 'Máté and Szandra' }));

    expect(filename).toBe('Invitation_MateAndSzandra_EN.pdf');
  });

  test('sanitises characters that are unsafe in filenames', () => {
    const { filename } = render(
      input({ guests: 'Ana-Maria & José / "Friends"' }),
    );

    expect(filename).toMatch(/^Invitation_[A-Za-z0-9]+_EN\.pdf$/);
  });

  test('keeps non-Latin guest names in the filename', () => {
    const { filename } = render(
      input({ guests: 'Семья Ивановых', language: 'ru' }),
    );

    // Must not collapse to a generic placeholder: distinct guests would collide.
    expect(filename).not.toBe('Invitation_Guest_RU.pdf');
    expect(filename).toContain('RU');
    expect(filename).toMatch(/^Invitation_.+_RU\.pdf$/);
  });

  test('gives different guests different filenames', () => {
    const a = render(input({ guests: 'Семья Ивановых', language: 'ru' }));
    const b = render(input({ guests: 'Анна Петрова', language: 'ru' }));

    expect(a.filename).not.toBe(b.filename);
  });

  test('shows exactly one time, labeled with its zone', () => {
    const { markdown } = render(input());

    // Base instant is 18:10 EEST; Romania guest sees the home time.
    expect(markdown).toContain('18:10');
    expect(markdown).toMatch(/UTC\+3/);
  });

  test('never shows a second, conflicting time', () => {
    const { markdown } = render(input({ countryCode: 'US-EASTERN' }));

    // US guest sees 11:10 only — not both 18:10 and 11:10.
    expect(markdown).toContain('11:10');
    expect(markdown).not.toContain('18:10');
  });

  test('names the guest zone assumption so the time is unambiguous', () => {
    const { markdown } = render(input({ countryCode: 'US-EASTERN' }));

    // The offset must be present, and multi-zone countries state their pick.
    expect(markdown).toMatch(/UTC-4/);
    expect(markdown).toContain('US Eastern time');
  });

  test('never mentions either partner zone to an unrelated guest', () => {
    // The groom is in Romania and the bride in the Philippines, so there is no
    // single "couple's time". A Moscow guest sees МСК and neither country.
    const { markdown } = render(input({ language: 'ru', countryCode: 'RU' }));

    expect(markdown).toContain('МСК');
    expect(markdown).not.toContain('Румыни');
    expect(markdown).not.toContain('Romania');
  });

  test('names the guest own zone, including the groom and bride countries', () => {
    // A Romanian guest gets "Romania time" because that is THEIR zone — the
    // same treatment every country gets. It is not special, and it is not
    // privileged as a "home". The rule is only that a guest must not be shown
    // a country they are not in.
    const { markdown } = render(input({ countryCode: 'RO' }));

    expect(markdown).toContain('18:10');
    expect(markdown).toContain('UTC+3');
    expect(markdown).toContain('Romania time');
  });

  test('names only the guest zone, in every language', () => {
    const cases = [
      { language: 'en' as const, countryCode: 'PH', expect: 'PHT' },
      { language: 'ru' as const, countryCode: 'RU', expect: 'МСК' },
      { language: 'ceb' as const, countryCode: 'PH', expect: 'PHT' },
    ];

    for (const c of cases) {
      const { markdown } = render(input(c));
      expect(markdown).toContain(c.expect);
      // None of these guests is in Romania or the Philippines.
      expect(markdown).not.toMatch(/Romania|Румыни/);
    }
  });

  test('rejects an unknown country rather than silently using the home zone', () => {
    expect(() => render(input({ countryCode: 'ZZ' }))).toThrow(
      /unknown country/i,
    );
  });
});

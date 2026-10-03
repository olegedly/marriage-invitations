import { describe, expect, test } from 'vitest';
import { COVER_PHOTO, coverMarkup, type CoverData } from '../src/cover.js';

/**
 * The cover is the one place the renderer emits HTML, so its values are the one
 * place an unescaped guest-facing string could break the page. The names come
 * from the event constants today, but the escaping is what keeps that from
 * mattering if one ever contains an ampersand.
 */

const BASE: CoverData = {
  label: 'Save the date',
  groom: 'Oleg',
  bride: 'Rose',
  conjunction: '&',
  date: 'Tuesday, 13 October 2026',
  venue: 'Online',
  shape: 'arched',
};

describe('coverMarkup', () => {
  test('points the photograph at the templates directory', () => {
    // Relative on purpose: the PDF renderer serves that directory and points
    // Chromium at it, so an absolute path would bake this machine into the file.
    expect(COVER_PHOTO).toBe('images/photo.jpg');
    expect(coverMarkup(BASE)).toContain(`<img src="${COVER_PHOTO}"`);
  });

  test('escapes names so a value cannot break out of the page', () => {
    const html = coverMarkup({
      ...BASE,
      groom: 'A & B <script>alert(1)</script>',
      bride: 'Rose "Rosie"',
    });

    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;Rosie&quot;');
  });

  test('gives every element its own line for the text preview', () => {
    // The preview reads the markdown line by line and strips the tags (see
    // client/src/preview-text.ts), so a line holding two elements would merge
    // two of the cover's lines into one. This is the exact text it will show.
    const text = coverMarkup(BASE)
      .split('\n')
      .map((line) =>
        line
          .replace(/<[^>]*>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);

    expect(text).toEqual([
      'Save the date',
      'Oleg',
      '&',
      'Rose',
      'Tuesday, 13 October 2026',
      'Online',
    ]);
  });

  test('names the frame shape on the section, for the stylesheet', () => {
    expect(coverMarkup(BASE)).toContain('<section class="cover cover--arched">');
    expect(coverMarkup({ ...BASE, shape: 'rectangular' })).toContain(
      '<section class="cover cover--rectangular">',
    );
  });

  test('uses the conjunction it is given, not a fixed ampersand', () => {
    // Russian joins two names with "и"; the cover must not decide that itself.
    const html = coverMarkup({ ...BASE, conjunction: 'и' });

    expect(html).toContain('class="cover-and">и<');
    expect(html).not.toContain('&amp;');
  });

  test('carries the label, the names, the date and the venue', () => {
    const html = coverMarkup(BASE);

    expect(html).toContain('>Save the date<');
    expect(html).toContain('>Oleg<');
    expect(html).toContain('>Rose<');
    expect(html).toContain('>Tuesday, 13 October 2026<');
    expect(html).toContain('>Online<');
  });
});

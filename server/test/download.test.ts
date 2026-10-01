import { describe, expect, test } from 'vitest';
import { contentDisposition } from '../src/download.js';

/**
 * A raw non-ASCII byte in a header makes Node throw ERR_INVALID_CHAR, turning
 * the whole response into a 500. These tests exist because that happened for
 * Cyrillic guest names.
 */
describe('content-disposition', () => {
  test('keeps an ASCII filename as-is', () => {
    const header = contentDisposition('Invitation_Loimie_EN.pdf');

    expect(header).toContain('filename="Invitation_Loimie_EN.pdf"');
  });

  test('contains no non-ASCII characters for a Cyrillic filename', () => {
    const header = contentDisposition('Invitation_СемьяИвановых_RU.pdf');

    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true);
  });

  test('still encodes the real Unicode filename so browsers show it', () => {
    const header = contentDisposition('Invitation_СемьяИвановых_RU.pdf');

    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('СемьяИвановых'));
  });

  test('keeps a usable .pdf fallback even when the stem is non-Latin', () => {
    const header = contentDisposition('Invitation_СемьяИвановых_RU.pdf');
    const fallback = /filename="([^"]+)"/.exec(header)?.[1];

    expect(fallback).toMatch(/\.pdf$/);
    expect(fallback).toMatch(/^[\x20-\x7e]+$/);
  });

  test('does not leave a bare quote or backslash in the ASCII fallback', () => {
    const header = contentDisposition('Invitation_An"na\\Bob_EN.pdf');
    const fallback = /filename="([^"]+)"/.exec(header)?.[1];

    expect(fallback).not.toContain('"');
    expect(fallback).not.toContain('\\');
  });

  test('works for a filename that is entirely non-ASCII', () => {
    const header = contentDisposition('Семья.pdf');

    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true);
    expect(header).toContain('.pdf');
  });

  test('escapes characters the RFC wants percent-encoded', () => {
    const header = contentDisposition("Invitation_O'Brien (Jr)_EN.pdf");

    const encoded = header.split("filename*=UTF-8''")[1];
    expect(encoded).not.toContain("'");
    expect(encoded).not.toContain('(');
  });
});

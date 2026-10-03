import { describe, expect, test } from 'vitest';
import { filenameFrom } from '../src/api.js';
import { contentDisposition } from '../../server/src/download.js';

/**
 * The browser is handed the filename in two parameters: an ASCII `filename`
 * fallback and a UTF-8 `filename*`. RFC 6266 says filename* wins when both are
 * present, and it has to: the fallback cannot carry Cyrillic, so a parser that
 * reads it first saves every Russian guest as `Invitation__RU.pdf`.
 *
 * That parser is filenameFrom, and these tests exist because that happened.
 */
describe('filenameFrom', () => {
  test('prefers the UTF-8 filename* over the ASCII fallback', () => {
    const header =
      'attachment; filename="Invitation__RU.pdf"; ' +
      "filename*=UTF-8''Invitation_%D0%A1%D0%B5%D0%BC%D1%8C%D1%8F%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%D1%8B%D1%85_RU.pdf";

    expect(filenameFrom(header)).toBe('Invitation_СемьяИвановых_RU.pdf');
  });

  test('decodes a non-ASCII filename* even when the fallback is usable', () => {
    const header =
      'attachment; filename="Invitation_MateAndSzandra_EN.pdf"; ' +
      "filename*=UTF-8''Invitation_M%C3%A1t%C3%A9_EN.pdf";

    expect(filenameFrom(header)).toBe('Invitation_Máté_EN.pdf');
  });

  test('reads a quoted plain filename when there is no filename*', () => {
    expect(filenameFrom('attachment; filename="Invitation_Loimie_EN.pdf"')).toBe(
      'Invitation_Loimie_EN.pdf',
    );
  });

  test('reads an unquoted plain filename when there is no filename*', () => {
    expect(filenameFrom('attachment; filename=Invitation_Loimie_EN.pdf')).toBe(
      'Invitation_Loimie_EN.pdf',
    );
  });

  test('is case-insensitive about the parameter names', () => {
    const header =
      'ATTACHMENT; FILENAME="Invitation__RU.pdf"; ' +
      "FILENAME*=UTF-8''Invitation_%D0%A1%D0%B5%D0%BC%D1%8C%D1%8F_RU.pdf";

    expect(filenameFrom(header)).toBe('Invitation_Семья_RU.pdf');
  });

  test('returns null when there is no header or no filename in it', () => {
    expect(filenameFrom(null)).toBeNull();
    expect(filenameFrom('attachment')).toBeNull();
  });
});

/**
 * The seam is the header itself, so parse what the server actually writes. A
 * change to either side that breaks the other fails here rather than in a
 * guest's downloads folder.
 */
describe('filenameFrom over a real content-disposition header', () => {
  test('recovers a Cyrillic guest name from the header the server builds', () => {
    const header = contentDisposition('Invitation_СемьяИвановых_RU.pdf');

    expect(filenameFrom(header)).toBe('Invitation_СемьяИвановых_RU.pdf');
  });

  test('recovers a Latin guest name that needs no encoding', () => {
    const header = contentDisposition('Invitation_MateAndSzandra_EN.pdf');

    expect(filenameFrom(header)).toBe('Invitation_MateAndSzandra_EN.pdf');
  });
});

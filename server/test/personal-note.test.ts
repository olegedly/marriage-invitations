import { describe, expect, test } from 'vitest';
import { guestInput as input, render } from './support/render.js';

/**
 * Seam T1, third slice: the optional personal note.
 *
 * The note must never break the surrounding reading flow, so these assert
 * structural guarantees (it is plain copy, it sits between intro and details,
 * it is omitted cleanly when absent) rather than wording.
 */

describe('personal note', () => {
  test('is omitted entirely when absent', () => {
    const { markdown } = render(input({ personalNote: null }));

    // No stray empty block left behind: without a note there is no quote.
    expect(markdown).not.toMatch(/^>/m);
  });

  test('is omitted when blank rather than null', () => {
    const { markdown } = render(input({ personalNote: '   \n  ' }));

    expect(markdown).not.toMatch(/^>/m);
  });

  test('appears as a distinct block between the intro and the details', () => {
    const note = 'So glad you can make it!';
    const { markdown } = render(input({ personalNote: note }));

    const introAt = markdown.indexOf('this special occasion');
    const noteAt = markdown.indexOf(note);
    const detailsAt = markdown.indexOf('##');

    expect(introAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(introAt);
    expect(detailsAt).toBeGreaterThan(noteAt);
  });

  test('is ordinary copy, so it reads as the paragraph after the intro', () => {
    const { markdown } = render(input({ personalNote: 'First thought.' }));

    // No blockquote, and no marker of any kind: the note is a paragraph of the
    // letter, so it shares the form of the intro above it.
    expect(markdown).not.toMatch(/^>/m);
    expect(markdown).toContain('\nFirst thought.\n');
  });

  test('keeps a blank line in the note as its own paragraph', () => {
    const { markdown } = render(
      input({ personalNote: 'First thought.\n\nSecond thought.' }),
    );

    // Two paragraphs of plain copy, each on its own line, rather than two
    // quoted lines held together as one block.
    expect(markdown).toContain('First thought.\n\nSecond thought.');
    expect(markdown).not.toMatch(/^>/m);
  });

  test('preserves the note verbatim, including punctuation', () => {
    const note = 'Congrats, you two — finally! 🎉';
    const { markdown } = render(input({ personalNote: note }));

    expect(markdown).toContain(note);
  });

  test('carries no lead-in of its own, in any language', () => {
    // Each language's own intro, because the note is placed relative to it
    // rather than at a fixed offset from the top of the page.
    const INTROS = {
      en: 'this special occasion',
      ru: 'этот особенный день',
      ceb: 'niining espesyal nga okasyon',
    } as const;

    for (const language of ['en', 'ru', 'ceb'] as const) {
      const { markdown } = render(
        input({ language, personalNote: 'Magkita ta!' }),
      );

      // The note IS the copy. A lead-in such as "A note for you" would state
      // what the greeting already says, so the line after the intro is the
      // note itself in every language, with nothing added in front of it.
      const lines = markdown.split('\n');
      const introAt = lines.findIndex((line) => line.includes(INTROS[language]));
      expect(introAt).toBeGreaterThan(-1);
      expect(lines[introAt + 2]).toBe('Magkita ta!');
    }
  });

  test('does not alter the filename', () => {
    const withNote = render(input({ personalNote: 'Hello!' }));
    const without = render(input({ personalNote: null }));

    expect(withNote.filename).toBe(without.filename);
  });

  test('handles a note containing markdown characters safely', () => {
    const { markdown } = render(
      input({ personalNote: 'Use *asterisks* and _underscores_ freely.' }),
    );

    expect(markdown).toContain('Use *asterisks* and _underscores_ freely.');
  });
});

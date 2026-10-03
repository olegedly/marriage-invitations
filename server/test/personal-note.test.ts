import { describe, expect, test } from 'vitest';
import { guestInput as input, render } from './support/render.js';

/**
 * Seam T1, third slice: the optional personal note.
 *
 * The note must never break the surrounding reading flow, so these assert
 * structural guarantees (it is one block, it sits between intro and details,
 * it is omitted cleanly when absent) rather than wording.
 */

describe('personal note', () => {
  test('is omitted entirely when absent', () => {
    const { markdown } = render(input({ personalNote: null }));

    // No stray empty blockquote left behind: without a note there is no quote.
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

  test('keeps the note in one unbroken blockquote so it reads as an aside', () => {
    const { markdown } = render(
      input({ personalNote: 'First thought.\n\nSecond thought.' }),
    );

    const noteLines = markdown.split('\n').filter((l) => l.startsWith('>'));
    expect(noteLines.length).toBeGreaterThanOrEqual(3);
    // Every note line stays inside the quote; none escape into body text.
    expect(markdown).toContain('> First thought.');
    expect(markdown).toContain('> Second thought.');
  });

  test('preserves the note verbatim, including punctuation', () => {
    const note = 'Congrats, you two — finally! 🎉';
    const { markdown } = render(input({ personalNote: note }));

    expect(markdown).toContain(note);
  });

  test('carries no lead-in of its own, in any language', () => {
    for (const language of ['en', 'ru', 'ceb'] as const) {
      const { markdown } = render(
        input({ language, personalNote: 'Magkita ta!' }),
      );

      // The quote IS the note. A lead-in such as "A note for you" would state
      // what the aside already makes plain, so the first quoted line is the
      // note itself in every language.
      const firstQuote = markdown.split('\n').find((line) => line.startsWith('>'));
      expect(firstQuote).toBe('> Magkita ta!');
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

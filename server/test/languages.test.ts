import { describe, expect, test } from 'vitest';
import type { GenerationInput } from '../src/render.js';
import { render } from './support/render.js';

/**
 * Seam T1, second slice: the language matrix.
 *
 * These assert which grammatical form was selected — not that the prose reads
 * naturally. Prose quality is a proofreading matter, not a testable one.
 *
 * Number is the only address axis. Singular uses the familiar forms and plural
 * the plural ones; formality is not offered, so no pair of inputs differs by
 * register alone.
 */

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    guests: 'Guest Name',
    language: 'en',
    number: 'singular',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    photoShape: 'arched',
    ...overrides,
  };
}

describe('Russian address forms', () => {
  test('singular masculine', () => {
    const { markdown } = render(input({ language: 'ru', gender: 'masculine' }));
    expect(markdown).toContain('Дорогой');
  });

  test('singular feminine uses the feminine adjective', () => {
    const { markdown } = render(input({ language: 'ru', gender: 'feminine' }));
    expect(markdown).toContain('Дорогая');
    expect(markdown).not.toContain('Дорогой');
  });

  test('plural uses the friends form', () => {
    const { markdown } = render(input({ language: 'ru', number: 'plural' }));
    expect(markdown).toContain('Дорогие');
  });

  test('plural collapses gender entirely', () => {
    const m = render(input({ language: 'ru', number: 'plural', gender: 'masculine' })).markdown;
    const f = render(input({ language: 'ru', number: 'plural', gender: 'feminine' })).markdown;

    expect(m).toBe(f);
  });

  test('singular addresses one guest with ты, not вы', () => {
    const { markdown } = render(input({ language: 'ru', gender: 'masculine' }));

    // "с вами" contradicts "Дорогой" — the pronoun must be singular.
    expect(markdown).not.toContain('с вами');
    expect(markdown).toContain('с тобой');
  });

  test('plural addresses several guests with вы, not ты', () => {
    const { markdown } = render(input({ language: 'ru', number: 'plural' }));

    expect(markdown).toContain('с вами');
    expect(markdown).not.toContain('с тобой');
  });
});

describe('Cebuano address forms', () => {
  test('singular addresses one guest with the enclitic ka', () => {
    const { markdown } = render(input({ language: 'ceb', number: 'singular' }));

    // Cebuano marks "you" on the verb as the enclitic "ka"; the free pronoun
    // "ikaw" is not required and would read stiffly here.
    expect(markdown).toContain('makauban ka');
    expect(markdown).not.toContain('makauban kamo');
  });

  test('plural addresses several guests with kamo', () => {
    const { markdown } = render(input({ language: 'ceb', number: 'plural' }));

    expect(markdown).toContain('makauban kamo');
  });

  test('plural greeting uses mga, singular does not', () => {
    const plural = render(input({ language: 'ceb', number: 'plural' })).markdown;
    const singular = render(input({ language: 'ceb', number: 'singular' })).markdown;

    expect(plural).toContain('Minahal nga mga');
    expect(singular).toContain('Minahal nga');
    expect(singular).not.toContain('Minahal nga mga');
  });

  test('ignores gender, which Cebuano does not mark', () => {
    const m = render(input({ language: 'ceb', gender: 'masculine' })).markdown;
    const f = render(input({ language: 'ceb', gender: 'feminine' })).markdown;

    expect(m).toBe(f);
  });

  test('shows the time in Cebuano, not English', () => {
    const { markdown } = render(input({ language: 'ceb', countryCode: 'PH' }));

    // "October 13, 2026 at 23:10" would be English leaking into Bisaya copy.
    expect(markdown).toContain('Martes, Oktubre 13, 2026 sa 23:10');
    expect(markdown).not.toContain('October');
  });
});

describe('English address forms', () => {
  test('the greeting runs straight into the guest name', () => {
    const { markdown } = render(input({ language: 'en', number: 'plural' }));
    expect(markdown).toContain('Dear **Guest Name**');
  });

  test('the greeting names no noun of its own', () => {
    // "Dear guests, **Loimie**" says guest twice and leaves the comma
    // stranded before the name; the name alone is the noun.
    const { markdown } = render(input({ language: 'en', number: 'plural' }));

    expect(markdown).not.toContain('guests');
    expect(markdown).not.toContain('friends');
    expect(markdown).not.toContain('Dear,');
  });
});

/**
 * The surviving rule, and the reason the form no longer offers a tone: number
 * changes the invitation only where the language actually inflects for it.
 */
describe('number is the only address axis', () => {
  test('English renders one invitation for one guest or several', () => {
    const one = render(input({ language: 'en', number: 'singular' })).markdown;
    const many = render(input({ language: 'en', number: 'plural' })).markdown;

    expect(one).toBe(many);
  });

  test('Russian and Cebuano change with number', () => {
    for (const language of ['ru', 'ceb'] as const) {
      const one = render(input({ language, number: 'singular' })).markdown;
      const many = render(input({ language, number: 'plural' })).markdown;

      expect(one).not.toBe(many);
    }
  });
});

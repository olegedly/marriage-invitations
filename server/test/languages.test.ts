import { describe, expect, test } from 'vitest';
import type { GenerationInput } from '../src/render.js';
import { render } from './support/render.js';

/**
 * Seam T1, second slice: the language matrix.
 *
 * These assert which grammatical form was selected — not that the prose reads
 * naturally. Prose quality is a proofreading matter, not a testable one.
 */

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    guests: 'Guest Name',
    language: 'en',
    number: 'singular',
    register: 'formal',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    ...overrides,
  };
}

describe('Russian address forms', () => {
  test('formal singular masculine', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'formal', gender: 'masculine' }),
    );
    expect(markdown).toContain('Уважаемый');
  });

  test('formal singular feminine', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'formal', gender: 'feminine' }),
    );
    expect(markdown).toContain('Уважаемая');
  });

  test('informal singular masculine', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'informal', gender: 'masculine' }),
    );
    expect(markdown).toContain('Дорогой');
    expect(markdown).not.toContain('Уважаемый');
  });

  test('informal singular feminine uses the feminine adjective', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'informal', gender: 'feminine' }),
    );
    expect(markdown).toContain('Дорогая');
    expect(markdown).not.toContain('Дорогой');
  });

  test('plural collapses gender entirely', () => {
    const m = render(input({ language: 'ru', number: 'plural', gender: 'masculine' })).markdown;
    const f = render(input({ language: 'ru', number: 'plural', gender: 'feminine' })).markdown;

    expect(m).toBe(f);
    expect(m).toContain('Уважаемые');
  });

  test('informal plural uses the friends form', () => {
    const { markdown } = render(
      input({ language: 'ru', number: 'plural', register: 'informal' }),
    );
    expect(markdown).toContain('Дорогие');
  });

  test('informal singular addresses with ты, not вы', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'informal', gender: 'masculine' }),
    );

    // "видеть вас" contradicts "Дорогой" — the pronoun must be singular.
    expect(markdown).not.toContain('видеть вас');
    expect(markdown).toContain('тебя');
  });

  test('formal singular addresses with вы', () => {
    const { markdown } = render(
      input({ language: 'ru', register: 'formal', gender: 'masculine' }),
    );
    expect(markdown).toContain('вас');
    expect(markdown).not.toContain('тебя');
  });

  test('informal singular uses ты-forms in the CTAs', () => {
    const formal = render(
      input({ language: 'ru', register: 'formal', gender: 'masculine' }),
    ).markdown;
    const informal = render(
      input({ language: 'ru', register: 'informal', gender: 'masculine' }),
    ).markdown;

    expect(formal).not.toBe(informal);
  });
});

describe('Cebuano address forms', () => {
  test('singular informal addresses one person with the enclitic ka', () => {
    const { markdown } = render(
      input({ language: 'ceb', number: 'singular', register: 'informal' }),
    );

    // Cebuano marks "you" on the verb as the enclitic "ka"; the free pronoun
    // "ikaw" is not required and would read stiffly here.
    expect(markdown).toContain('makauban ka');
    expect(markdown).not.toContain('makauban kamo');
  });

  test('plural addresses several people with kamo', () => {
    const { markdown } = render(
      input({ language: 'ceb', number: 'plural' }),
    );
    expect(markdown).toContain('makauban kamo');
  });

  test('formal singular uses the polite plural, never the bare ka', () => {
    const { markdown } = render(
      input({ language: 'ceb', number: 'singular', register: 'formal' }),
    );

    // For one respected person, "kamo" is polite while "ka" is too familiar.
    expect(markdown).toContain('makauban kamo namo');
    // Word-boundary match so the "ka" inside "kamo" is not a false positive.
    expect(markdown).not.toMatch(/makauban ka\b(?!mo)/);
  });

  test('plural greeting uses the plural form, singular the singular', () => {
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
    const { markdown } = render(
      input({ language: 'ceb', countryCode: 'PH' }),
    );

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
    // "Dear guests, **Hanna Bekele**" says guest twice and leaves the comma
    // stranded before the name; the name alone is the noun.
    const { markdown } = render(input({ language: 'en', number: 'plural' }));

    expect(markdown).not.toContain('guests');
    expect(markdown).not.toContain('friends');
    expect(markdown).not.toContain('Dear,');
  });

  test('register does not change the English greeting', () => {
    const formal = render(input({ language: 'en', register: 'formal' })).markdown;
    const informal = render(input({ language: 'en', register: 'informal' })).markdown;

    expect(formal).toContain('Dear **Guest Name**');
    expect(informal).toContain('Dear **Guest Name**');
  });
});

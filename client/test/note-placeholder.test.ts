import { describe, expect, test } from 'vitest';
import { LANGUAGE_LABELS, NOTE_LIMIT, NOTE_PLACEHOLDER, type Language } from '../src/types.js';

const LANGUAGES = Object.keys(LANGUAGE_LABELS) as Language[];

/**
 * The personal note placeholder is the one string in the form that becomes copy
 * a guest reads: every other label describes a choosing act, which reads the
 * same whatever language the invitation is in. It is therefore expected to
 * exist in each language the form offers, rather than English standing in for
 * all of them.
 */
describe('the personal note placeholder', () => {
  test('is written for every language the form offers', () => {
    for (const language of LANGUAGES) {
      expect(NOTE_PLACEHOLDER[language]?.trim()).toBeTruthy();
    }
  });

  test('gives each language its own text, not a borrowed English one', () => {
    const texts = LANGUAGES.map((language) => NOTE_PLACEHOLDER[language]);

    expect(new Set(texts).size).toBe(LANGUAGES.length);
  });

  test('fits the limit, so an operator can actually send what it suggests', () => {
    // A placeholder longer than the field would model a note that the form
    // refuses, which is the worst thing a sample can teach.
    for (const language of LANGUAGES) {
      expect(NOTE_PLACEHOLDER[language].length).toBeLessThanOrEqual(NOTE_LIMIT);
    }
  });

  test('speaks in one person voice, since one half of the couple adds it', () => {
    // "We" would read as a note from the couple jointly; the common case is
    // that whoever extended this particular invitation writes it alone.
    expect(NOTE_PLACEHOLDER.en).toMatch(/\bI\b/);
    expect(NOTE_PLACEHOLDER.en).not.toMatch(/\bwe\b/i);
  });
});

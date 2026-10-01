/**
 * Seam T4: generation history.
 *
 * Records are addressed by their own interface — save, list, load — never by
 * issuing SQL in the tests. A real SQLite file is used (temp per test) rather
 * than a mock, so persistence behavior is genuinely exercised.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openHistory, type History } from '../src/history.js';
import type { GenerationInput } from '../src/render.js';
import { render } from './support/render.js';

let dir: string;
let history: History;

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    guests: 'Hanna Bekele',
    language: 'en',
    number: 'singular',
    register: 'formal',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'invitations-'));
  history = openHistory(join(dir, 'history.sqlite'));
});

afterEach(() => {
  history.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('generation history', () => {
  test('is empty before anything is generated', () => {
    expect(history.list()).toEqual([]);
  });

  test('stores a generation so it can be listed', () => {
    const rendered = render(input());
    history.save({ input: input(), ...rendered });

    const entries = history.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.guests).toBe('Hanna Bekele');
    expect(entries[0]!.language).toBe('en');
  });

  test('returns the stored markdown so a past invitation can be re-read', () => {
    const rendered = render(input({ personalNote: 'Lovely to see you!' }));
    const saved = history.save({ input: input({ personalNote: 'Lovely to see you!' }), ...rendered });

    const loaded = history.get(saved.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.markdown).toBe(rendered.markdown);
    expect(loaded!.markdown).toContain('Lovely to see you!');
  });

  test('lists newest first', () => {
    history.save({ input: input({ guests: 'First' }), ...render(input({ guests: 'First' })) });
    history.save({ input: input({ guests: 'Second' }), ...render(input({ guests: 'Second' })) });

    const guests = history.list().map((e) => e.guests);
    expect(guests[0]).toBe('Second');
  });

  test('keeps every generation as a separate record', () => {
    for (const name of ['Ana', 'Boris', 'Carmen']) {
      const i = input({ guests: name });
      history.save({ input: i, ...render(i) });
    }

    expect(history.list()).toHaveLength(3);
  });

  test('allows the same guest to be regenerated', () => {
    const i = input({ guests: 'Ana' });
    history.save({ input: i, ...render(i) });
    history.save({ input: i, ...render(i) });

    expect(history.list()).toHaveLength(2);
  });

  test('records the selections so history shows what was chosen', () => {
    const i = input({
      guests: 'Анна',
      language: 'ru',
      number: 'singular',
      register: 'informal',
      gender: 'feminine',
      countryCode: 'RU',
    });
    history.save({ input: i, ...render(i) });

    const entry = history.list()[0]!;
    expect(entry).toMatchObject({
      language: 'ru',
      number: 'singular',
      register: 'informal',
      gender: 'feminine',
      countryCode: 'RU',
    });
  });

  test('returns null for an unknown id rather than throwing', () => {
    expect(history.get('does-not-exist')).toBeNull();
  });

  test('survives reopening the database file', () => {
    const i = input({ guests: 'Persisted' });
    history.save({ input: i, ...render(i) });
    history.close();

    const reopened = openHistory(join(dir, 'history.sqlite'));
    expect(reopened.list().map((e) => e.guests)).toContain('Persisted');
    reopened.close();
  });
});

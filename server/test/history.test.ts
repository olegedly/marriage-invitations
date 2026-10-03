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
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { generationInputOf, openHistory, type History } from '../src/history.js';
import { guestInput as input, render } from './support/render.js';

let dir: string;
let history: History;

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
    expect(entries[0]!.guests).toBe('Loimie');
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

describe('the photo frame on a stored invitation', () => {
  test('is kept with the record and handed back to the renderer', () => {
    // The arch, deliberately not today's default: a store that quietly wrote
    // the default instead of the input would still pass a rectangular check.
    const i = input({ photoShape: 'arched' });
    history.save({ input: i, ...render(i) });

    const entry = history.list()[0]!;
    expect(entry.photoShape).toBe('arched');
    expect(generationInputOf(entry).photoShape).toBe('arched');
  });

  test('reads as the arch for a record written before it was an option', () => {
    /*
     * Raw SQL stands in for an older build here — the only way to get a schema
     * this version did not create. Everything else goes through the store's own
     * interface. The point is the upgrade path: an existing history file must
     * open and keep working, not fail every insert on a missing column.
     */
    const path = join(dir, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE generations (
        id            TEXT PRIMARY KEY,
        created_at    TEXT NOT NULL,
        guests        TEXT NOT NULL,
        language      TEXT NOT NULL,
        number        TEXT NOT NULL,
        register      TEXT NOT NULL,
        gender        TEXT NOT NULL,
        country_code  TEXT NOT NULL,
        personal_note TEXT,
        filename      TEXT NOT NULL,
        markdown      TEXT NOT NULL
      );
    `);
    legacy
      .prepare(`INSERT INTO generations VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        'legacy-1',
        new Date().toISOString(),
        'Loimie',
        'en',
        'singular',
        'formal',
        'neutral',
        'RO',
        null,
        'Invitation_Loimie_EN.pdf',
        '# Our Wedding',
      );
    legacy.close();

    const opened = openHistory(path);
    try {
      expect(opened.get('legacy-1')!.photoShape).toBe('arched');

      // The migrated table takes new records, and the legacy rows keep the
      // frame they were sent with rather than being swept to the new default.
      const i = input({ guests: 'After the upgrade', photoShape: 'rectangular' });
      opened.save({ input: i, ...render(i) });

      expect(opened.list().map((e) => [e.guests, e.photoShape])).toEqual([
        ['After the upgrade', 'rectangular'],
        ['Loimie', 'arched'],
      ]);
    } finally {
      opened.close();
    }
  });
});

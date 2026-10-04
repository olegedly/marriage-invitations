/**
 * Seam T4: generation history.
 *
 * Records are addressed by their own interface — save, list, get — never by
 * issuing SQL in the tests, with one exception: a test that stands in for an
 * older build has to write a file this version would not have created. A real
 * SQLite file is used (temp per test) rather than a mock, so persistence
 * behavior is genuinely exercised.
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  generationInputOf,
  openHistory,
  type History,
  type HistoryEntry,
} from '../src/history.js';
import type { GenerationInput } from '../src/render.js';
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

/**
 * Record an invitation the way POST /api/generate does: the store is handed the
 * guest's choices and the filename, never the markdown they rendered to.
 */
function record(choices: GenerationInput): HistoryEntry {
  return history.save({ input: choices, filename: render(choices).filename });
}

/**
 * The schema as it stood before the markdown column was dropped.
 *
 * Raw SQL stands in for an older build: writing this file is the only way to
 * get a database this version would not have created. The row carries a quoted
 * note, which is the obsolete markdown the current code can no longer render
 * and must not try to.
 */
const PREVIOUS_SCHEMA = `
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
    photo_shape   TEXT NOT NULL DEFAULT 'arched',
    filename      TEXT NOT NULL,
    markdown      TEXT NOT NULL
  );
`;

const PREVIOUS_INSERT = `
  INSERT INTO generations VALUES (
    'old-1', '2026-01-01T00:00:00.000Z', 'Loimie', 'en', 'singular', 'formal',
    'neutral', 'RO', null, 'arched', 'Invitation_Loimie_EN.pdf',
    '> Usa ka mensahe alang kanimo
>
> Wazzup?'
  );
`;

describe('generation history', () => {
  test('is empty before anything is generated', () => {
    expect(history.list()).toEqual([]);
  });

  test('stores a generation so it can be listed', () => {
    record(input());

    const entries = history.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.guests).toBe('Loimie');
    expect(entries[0]!.language).toBe('en');
  });

  test('keeps the guest choices and no rendering of them', () => {
    // The choices and the filename are the source of every rendering there
    // will ever be; the markdown and the PDF are not kept, so nothing here can
    // go stale and no route has to choose between an original and a current
    // rendering of the same invitation.
    const entry = record(input({ personalNote: 'Lovely to see you!' }));

    expect(entry.personalNote).toBe('Lovely to see you!');
    expect(entry.filename).toBe('Invitation_Loimie_EN.pdf');
    expect(entry).not.toHaveProperty('markdown');
    expect(history.get(entry.id)).not.toHaveProperty('markdown');
  });

  test('lists newest first', () => {
    record(input({ guests: 'First' }));
    record(input({ guests: 'Second' }));

    const guests = history.list().map((e) => e.guests);
    expect(guests[0]).toBe('Second');
  });

  test('keeps every generation as a separate record', () => {
    for (const name of ['Ana', 'Boris', 'Carmen']) {
      record(input({ guests: name }));
    }

    expect(history.list()).toHaveLength(3);
  });

  test('allows the same guest to be regenerated', () => {
    record(input({ guests: 'Ana' }));
    record(input({ guests: 'Ana' }));

    expect(history.list()).toHaveLength(2);
  });

  test('records the selections so history shows what was chosen', () => {
    record(
      input({
        guests: 'Анна',
        language: 'ru',
        number: 'singular',
        register: 'informal',
        gender: 'feminine',
        countryCode: 'RU',
      }),
    );

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
});

describe('the photo frame on a stored invitation', () => {
  test('is kept with the record and handed back to the renderer', () => {
    // The arch, deliberately not today's default: a store that quietly wrote
    // the default instead of the input would still pass a rectangular check.
    record(input({ photoShape: 'arched' }));

    const entry = history.list()[0]!;
    expect(entry.photoShape).toBe('arched');
    expect(generationInputOf(entry).photoShape).toBe('arched');
  });
});

describe('a database this version did not create', () => {
  /** Write a file in the schema this change replaced, with one row in it. */
  function writePrevious(path: string): void {
    const previous = new Database(path);
    previous.exec(PREVIOUS_SCHEMA);
    previous.exec(PREVIOUS_INSERT);
    previous.close();
  }

  test('is replaced, so obsolete markdown cannot be rendered again', () => {
    const path = join(dir, 'previous.sqlite');
    writePrevious(path);

    const notices: string[] = [];
    const opened = openHistory(path, { onReset: (reason) => notices.push(reason) });
    try {
      // The quoted note is gone with the schema that could hold it.
      expect(opened.list()).toEqual([]);

      // And the file is usable under the current schema straight away.
      const entry = opened.save({
        input: input({ guests: 'After the wipe', photoShape: 'arched' }),
        filename: 'Invitation_After_EN.pdf',
      });
      expect(opened.list().map((e) => e.guests)).toEqual(['After the wipe']);
      expect(entry.photoShape).toBe('arched');
    } finally {
      opened.close();
    }

    // Discarding a history is reported rather than done silently.
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain(path);
  });

  test('is replaced even when the discard has to reach a write-ahead log', () => {
    const live = join(dir, 'live.sqlite');
    const crashed = join(dir, 'crashed.sqlite');

    /*
     * A connection that wrote in WAL mode and never closed: the committed row
     * is in the log beside the database, which is the state an unclean shutdown
     * leaves behind. Deleting only the main file would let SQLite replay those
     * frames into the replacement, bringing back exactly the rows the reset is
     * meant to discard. The shared-memory file is left out on purpose: SQLite
     * rebuilds it from the log.
     */
    const writer = new Database(live);
    writer.pragma('journal_mode = WAL');
    writer.exec(PREVIOUS_SCHEMA);
    writer.exec(PREVIOUS_INSERT);
    for (const suffix of ['', '-wal']) {
      copyFileSync(`${live}${suffix}`, `${crashed}${suffix}`);
    }
    writer.close();

    const opened = openHistory(crashed);
    try {
      expect(opened.list()).toEqual([]);
    } finally {
      opened.close();
    }
  });

  test('is left alone when it already matches, with no notice', () => {
    const path = join(dir, 'matching.sqlite');
    const notices: string[] = [];

    const first = openHistory(path, { onReset: (reason) => notices.push(reason) });
    const entry = first.save({
      input: input({ guests: 'Kept' }),
      filename: 'Invitation_Kept_EN.pdf',
    });
    first.close();

    // Reopening is the same file and the same rows: the schema matched, so
    // nothing was replaced and nothing was reported.
    const second = openHistory(path, { onReset: (reason) => notices.push(reason) });
    try {
      expect(second.list().map((e) => e.id)).toEqual([entry.id]);
    } finally {
      second.close();
    }

    expect(notices).toEqual([]);
  });
});

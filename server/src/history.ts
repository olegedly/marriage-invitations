/**
 * Seam T4: generation history, backed by SQLite.
 *
 * Deliberately small surface — save, list, get, close. A record holds the guest
 * choices an invitation was generated from, and nothing else. The markdown and
 * the PDF are both renderings of those choices: storing one would freeze the
 * wording and the links of the day it was made, and every route would then have
 * to say which of the two renderings it means.
 *
 * The schema below is the only shape this code knows. There are no migrations
 * and no compatibility reads: a file that does not match it exactly is replaced
 * on open (see openHistory), so this version never has an old database to
 * render the wrong thing from.
 */

import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { GenerationInput, Gender, NumberForm } from './render.js';
import type { Language } from './event.js';
import { DEFAULT_PHOTO_SHAPE, type PhotoShape } from './cover.js';

export interface HistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly guests: string;
  readonly language: Language;
  readonly number: NumberForm;
  readonly gender: Gender;
  readonly countryCode: string;
  readonly personalNote: string | null;
  readonly photoShape: PhotoShape;
  readonly filename: string;
}

export interface SaveInput {
  readonly input: GenerationInput;
  readonly filename: string;
}

export interface History {
  save(entry: SaveInput): HistoryEntry;
  list(): HistoryEntry[];
  get(id: string): HistoryEntry | null;
  close(): void;
}

interface Row {
  id: string;
  created_at: string;
  guests: string;
  language: string;
  number: string;
  gender: string;
  country_code: string;
  personal_note: string | null;
  photo_shape: string;
  filename: string;
}

function toEntry(row: Row): HistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    guests: row.guests,
    language: row.language as Language,
    number: row.number as NumberForm,
    gender: row.gender as Gender,
    countryCode: row.country_code,
    personalNote: row.personal_note,
    photoShape: row.photo_shape as PhotoShape,
    filename: row.filename,
  };
}

/**
 * The one schema, and the only one this code can read or write.
 *
 * Every open compares the file against this and replaces the file when it
 * differs (see openHistory), so changing anything here is also the migration:
 * the old file is the wrong shape and is discarded rather than upgraded. That
 * is a deliberate trade. This history is a convenience, and a migration is a
 * second schema to keep correct for as long as the file survives — which, on a
 * mounted volume, is forever.
 *
 * `IF NOT EXISTS` is not what guarantees the shape; the check in openHistory
 * is. The clause is only there so that opening a file that already matches
 * leaves it alone.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS generations (
    id            TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL,
    guests        TEXT NOT NULL,
    language      TEXT NOT NULL,
    number        TEXT NOT NULL,
    gender        TEXT NOT NULL,
    country_code  TEXT NOT NULL,
    personal_note TEXT,
    photo_shape   TEXT NOT NULL DEFAULT '${DEFAULT_PHOTO_SHAPE}',
    filename      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS generations_created_at
    ON generations (created_at DESC);
`;

/**
 * Rebuild the guest-specific input a past entry was generated from.
 *
 * The choices are the record. Every rendering of a past invitation — the PDF
 * and the text preview alike — is rebuilt from them, so it reflects the
 * constants and the template in force now rather than those of the day it was
 * generated.
 */
export function generationInputOf(entry: HistoryEntry): GenerationInput {
  return {
    guests: entry.guests,
    language: entry.language,
    number: entry.number,
    gender: entry.gender,
    countryCode: entry.countryCode,
    personalNote: entry.personalNote,
    photoShape: entry.photoShape,
  };
}

/**
 * A database's shape, as one string for an exact comparison.
 *
 * Compared structurally rather than by the CREATE statements SQLite keeps: a
 * statement is stored as it was written, and rewritten when SQLite backfills a
 * new column into it, so comparing that text would read a reformatted schema as
 * a different one — and wipe a live history over a change of whitespace.
 */
function shapeOf(db: Database.Database): string {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    )
    .all() as { name: string }[];

  return JSON.stringify(
    tables.map(({ name }) => ({
      name,
      columns: db.prepare(`PRAGMA table_info("${name}")`).all(),
      indexes: (
        db.prepare(`PRAGMA index_list("${name}")`).all() as {
          name: string;
          unique: number;
        }[]
      )
        .map((index) => ({
          name: index.name,
          unique: index.unique,
          columns: db.prepare(`PRAGMA index_info("${index.name}")`).all(),
        }))
        // index_list is in creation order, which is not part of the shape.
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
  );
}

/**
 * Whether a file is the schema above and nothing else.
 *
 * Built by applying SCHEMA to a throwaway in-memory database and comparing the
 * two shapes, so the schema has one definition rather than a second, parallel
 * description of what it is expected to contain.
 *
 * A file with no schema at all — empty, or truncated by a crash — is not a
 * match either, so it takes the same path as a stale one.
 */
function matchesCurrentSchema(db: Database.Database): boolean {
  const reference = new Database(':memory:');
  try {
    reference.exec(SCHEMA);
    return shapeOf(db) === shapeOf(reference);
  } finally {
    reference.close();
  }
}

/**
 * Delete the database and the write-ahead log beside it.
 *
 * The `-wal` file is not litter to leave behind: SQLite replays it into whatever
 * database is at the path, which would put back the rows this is discarding.
 */
function discard(path: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

export interface OpenHistoryOptions {
  /**
   * Called with a line fit for a startup log when a database was not the
   * current schema and had to be replaced. Discarding a history is not
   * something to do silently.
   */
  readonly onReset?: (reason: string) => void;
}

export function openHistory(path: string, options: OpenHistoryOptions = {}): History {
  const existed = existsSync(path);
  let db = new Database(path);

  if (existed && !matchesCurrentSchema(db)) {
    db.close();
    discard(path);
    options.onReset?.(`${path} is not the current schema and has been replaced`);
    db = new Database(path);
  }

  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insert = db.prepare(`
    INSERT INTO generations
      (id, created_at, guests, language, number, gender,
       country_code, personal_note, photo_shape, filename)
    VALUES
      (@id, @created_at, @guests, @language, @number, @gender,
       @country_code, @personal_note, @photo_shape, @filename)
  `);

  const selectAll = db.prepare(
    `SELECT * FROM generations ORDER BY created_at DESC, rowid DESC`,
  );
  const selectOne = db.prepare(`SELECT * FROM generations WHERE id = ?`);

  return {
    save({ input, filename }) {
      const entry: HistoryEntry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        guests: input.guests,
        language: input.language,
        number: input.number,
        gender: input.gender,
        countryCode: input.countryCode,
        personalNote: input.personalNote,
        photoShape: input.photoShape,
        filename,
      };

      insert.run({
        id: entry.id,
        created_at: entry.createdAt,
        guests: entry.guests,
        language: entry.language,
        number: entry.number,
        gender: entry.gender,
        country_code: entry.countryCode,
        personal_note: entry.personalNote,
        photo_shape: entry.photoShape,
        filename: entry.filename,
      });

      return entry;
    },

    list() {
      return (selectAll.all() as Row[]).map(toEntry);
    },

    get(id) {
      const row = selectOne.get(id) as Row | undefined;
      return row ? toEntry(row) : null;
    },

    close() {
      db.close();
    },
  };
}

/**
 * Seam T4: generation history, backed by SQLite.
 *
 * Deliberately small surface — save, list, get, close. The stored markdown is
 * the source of truth for a past invitation, so history keeps working even if
 * templates are edited later.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { GenerationInput, Gender, NumberForm, Register } from './render.js';
import type { Language } from './event.js';
import { DEFAULT_PHOTO_SHAPE, type PhotoShape } from './cover.js';

export interface HistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly guests: string;
  readonly language: Language;
  readonly number: NumberForm;
  readonly register: Register;
  readonly gender: Gender;
  readonly countryCode: string;
  readonly personalNote: string | null;
  readonly photoShape: PhotoShape;
  readonly filename: string;
  readonly markdown: string;
}

export interface SaveInput {
  readonly input: GenerationInput;
  readonly markdown: string;
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
  register: string;
  gender: string;
  country_code: string;
  personal_note: string | null;
  photo_shape: string | null;
  filename: string;
  markdown: string;
}

/**
 * The frame of a row written before the shape was a choice.
 *
 * Those invitations went out under the arch, so an old history file reads as
 * arched. That is a fact about the record, not today's default, and
 * `DEFAULT_PHOTO_SHAPE` must not be substituted for it — a re-download of a
 * sent invitation would then quietly change its cover.
 */
const PRE_OPTION_PHOTO_SHAPE: PhotoShape = 'arched';

function toEntry(row: Row): HistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    guests: row.guests,
    language: row.language as Language,
    number: row.number as NumberForm,
    register: row.register as Register,
    gender: row.gender as Gender,
    countryCode: row.country_code,
    personalNote: row.personal_note,
    // A row written before the frame shape was an option reads as the arch,
    // which is what it was generated with (see PRE_OPTION_PHOTO_SHAPE). The
    // migration's backfill covers those rows; this covers one that is somehow
    // null.
    photoShape: (row.photo_shape as PhotoShape | null) ?? PRE_OPTION_PHOTO_SHAPE,
    filename: row.filename,
    markdown: row.markdown,
  };
}

/**
 * Rebuild the guest-specific input a past entry was generated from.
 *
 * The stored markdown is only a rendering of this input under the constants and
 * template in force at the time. Keeping the input itself is what lets the same
 * invitation be rendered again with today's values (see GET
 * /api/history/:id/pdf/current) while the original stays untouched.
 */
export function generationInputOf(entry: HistoryEntry): GenerationInput {
  return {
    guests: entry.guests,
    language: entry.language,
    number: entry.number,
    register: entry.register,
    gender: entry.gender,
    countryCode: entry.countryCode,
    personalNote: entry.personalNote,
    photoShape: entry.photoShape,
  };
}

export function openHistory(path: string): History {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');

  /*
   * The column default follows the live default (`DEFAULT_PHOTO_SHAPE`): the
   * store always writes the shape explicitly, so it only stands in for an
   * insert that somehow omits it — and then today's frame is what it should be.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id            TEXT PRIMARY KEY,
      created_at    TEXT NOT NULL,
      guests        TEXT NOT NULL,
      language      TEXT NOT NULL,
      number        TEXT NOT NULL,
      register      TEXT NOT NULL,
      gender        TEXT NOT NULL,
      country_code  TEXT NOT NULL,
      personal_note TEXT,
      photo_shape   TEXT NOT NULL DEFAULT '${DEFAULT_PHOTO_SHAPE}',
      filename      TEXT NOT NULL,
      markdown      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS generations_created_at
      ON generations (created_at DESC);
  `);

  /*
   * A database created before the frame shape was an option has no column for
   * it. CREATE TABLE IF NOT EXISTS will not add one to a table that already
   * exists, so an older history would fail every insert without this. Unlike
   * the schema above, this default IS read: SQLite backfills every existing row
   * with it, and those rows were generated with the arch.
   */
  const columns = db.prepare(`PRAGMA table_info(generations)`).all() as { name: string }[];
  if (!columns.some((column) => column.name === 'photo_shape')) {
    db.exec(
      `ALTER TABLE generations ADD COLUMN photo_shape TEXT NOT NULL DEFAULT '${PRE_OPTION_PHOTO_SHAPE}'`,
    );
  }

  const insert = db.prepare(`
    INSERT INTO generations
      (id, created_at, guests, language, number, register, gender,
       country_code, personal_note, photo_shape, filename, markdown)
    VALUES
      (@id, @created_at, @guests, @language, @number, @register, @gender,
       @country_code, @personal_note, @photo_shape, @filename, @markdown)
  `);

  const selectAll = db.prepare(
    `SELECT * FROM generations ORDER BY created_at DESC, rowid DESC`,
  );
  const selectOne = db.prepare(`SELECT * FROM generations WHERE id = ?`);

  return {
    save({ input, markdown, filename }) {
      const entry: HistoryEntry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        guests: input.guests,
        language: input.language,
        number: input.number,
        register: input.register,
        gender: input.gender,
        countryCode: input.countryCode,
        personalNote: input.personalNote,
        photoShape: input.photoShape,
        filename,
        markdown,
      };

      insert.run({
        id: entry.id,
        created_at: entry.createdAt,
        guests: entry.guests,
        language: entry.language,
        number: entry.number,
        register: entry.register,
        gender: entry.gender,
        country_code: entry.countryCode,
        personal_note: entry.personalNote,
        photo_shape: entry.photoShape,
        filename: entry.filename,
        markdown: entry.markdown,
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

/**
 * Country -> timezone resolution and guest-facing time formatting.
 *
 * Two layers:
 *   - COUNTRY_ZONES is the curated shortlist. It carries the human labels, the
 *     multi-zone subdivisions, and the countries whose zone is a judgement call.
 *   - ISO_COUNTRIES is the full ISO 3166-1 list. Any country not curated is
 *     generated from it, so every country a guest could be in is selectable.
 *
 * Offsets are always computed from the IANA database at call time, never
 * stored, so a tzdata update is picked up on redeploy.
 */

import { EVENT, type Language } from './event.js';
import { ISO_COUNTRIES, type IsoCountry } from './countries.js';
import { offsetMinutes as zoneOffsetMinutes } from './tzdata.js';

/** A hand-curated selector entry. Offset is added when it is served. */
export interface CuratedZone {
  /** ISO 3166-1 alpha-2 code, or a custom code for sub-national entries. */
  readonly code: string;
  readonly name: string;
  /** IANA zone used as this country's default. */
  readonly zone: string;
  /** Guest-facing label in the guest's language, e.g. "МСК", "Germany time". */
  readonly label: Partial<Record<Language, string>>;
  /**
   * A country spanning several zones is listed per zone, and the picker shows
   * this abbreviation (e.g. "ET", "WIB") in place of the offset.
   */
  readonly abbr?: string;
  /** Pinned to the top of the selector. */
  readonly shortlist?: boolean;
  /** ISO country this entry belongs to. Defaults to `code`. */
  readonly iso?: string;
}

/** A selector entry as served over HTTP. */
export interface CountryZone extends CuratedZone {
  /** Ceremony-instant offset, e.g. "UTC+3". The picker shows it when there is no abbr. */
  readonly offset: string;
}

/**
 * Deliberately short list of curated entries with human labels and, for the
 * countries that span several zones, one entry per zone.
 *
 * Countries not present here are generated from the full ISO list by
 * `zoneForCountry`, so this table is an override, not the whole universe.
 *
 * Label rule: a single-zone country reads "<Country> time" in the guest's
 * language; a multi-zone country uses a well-known abbreviation, which is
 * DST-neutral ("ET", not "EST") because the numeric offset is rendered next to
 * it and a standard-time abbreviation would contradict a summer date.
 */
export const COUNTRY_ZONES: readonly CuratedZone[] = [
  { code: 'PH', name: 'Philippines', zone: 'Asia/Manila', label: { en: 'Philippines time', ru: 'время Филиппин', ceb: 'oras sa Philippines' }, shortlist: true },
  { code: 'RO', name: 'Romania', zone: 'Europe/Bucharest', label: { en: 'Romania time', ru: 'время Румынии', ceb: 'oras sa Romania' }, shortlist: true },
  { code: 'RU', name: 'Russia', zone: 'Europe/Moscow', label: { en: 'MSK', ru: 'МСК', ceb: 'MSK' }, abbr: 'MSK', shortlist: true },
  { code: 'HU', name: 'Hungary', zone: 'Europe/Budapest', label: { en: 'Hungary time', ru: 'время Венгрии', ceb: 'oras sa Hungary' }, shortlist: true },
  { code: 'MA', name: 'Morocco', zone: 'Africa/Casablanca', label: { en: 'Morocco time', ru: 'время Марокко', ceb: 'oras sa Morocco' }, shortlist: true },
  { code: 'VN', name: 'Vietnam', zone: 'Asia/Ho_Chi_Minh', label: { en: 'Vietnam time', ru: 'время Вьетнама', ceb: 'oras sa Vietnam' }, shortlist: true },
  { code: 'ID', name: 'Indonesia', zone: 'Asia/Jakarta', label: { en: 'WIB', ru: 'WIB', ceb: 'WIB' }, abbr: 'WIB', shortlist: true },
  { code: 'NL', name: 'Netherlands', zone: 'Europe/Amsterdam', label: { en: 'Netherlands time', ru: 'время Нидерландов', ceb: 'oras sa Netherlands' }, shortlist: true },
  { code: 'PL', name: 'Poland', zone: 'Europe/Warsaw', label: { en: 'Poland time', ru: 'время Польши', ceb: 'oras sa Poland' }, shortlist: true },
  { code: 'GE', name: 'Georgia', zone: 'Asia/Tbilisi', label: { en: 'Georgia time', ru: 'время Грузии', ceb: 'oras sa Georgia' }, shortlist: true },
  { code: 'BE', name: 'Belgium', zone: 'Europe/Brussels', label: { en: 'Belgium time', ru: 'время Бельгии', ceb: 'oras sa Belgium' }, shortlist: true },

  // Multi-zone countries your guests are likely to be in. Each entry states its
  // assumption, so the guest can see which zone was chosen.
  { code: 'US-EASTERN', iso: 'US', name: 'United States (Eastern)', zone: 'America/New_York', label: { en: 'ET', ru: 'ET', ceb: 'ET' }, abbr: 'ET' },
  { code: 'US-CENTRAL', iso: 'US', name: 'United States (Central)', zone: 'America/Chicago', label: { en: 'CT', ru: 'CT', ceb: 'CT' }, abbr: 'CT' },
  { code: 'US-MOUNTAIN', iso: 'US', name: 'United States (Mountain)', zone: 'America/Denver', label: { en: 'MT', ru: 'MT', ceb: 'MT' }, abbr: 'MT' },
  { code: 'US-PACIFIC', iso: 'US', name: 'United States (Pacific)', zone: 'America/Los_Angeles', label: { en: 'PT', ru: 'PT', ceb: 'PT' }, abbr: 'PT' },
  { code: 'CA-EASTERN', iso: 'CA', name: 'Canada (Eastern)', zone: 'America/Toronto', label: { en: 'ET', ru: 'ET', ceb: 'ET' }, abbr: 'ET' },
  { code: 'CA-PACIFIC', iso: 'CA', name: 'Canada (Pacific)', zone: 'America/Vancouver', label: { en: 'PT', ru: 'PT', ceb: 'PT' }, abbr: 'PT' },
  { code: 'AU-EASTERN', iso: 'AU', name: 'Australia (Eastern)', zone: 'Australia/Sydney', label: { en: 'AET', ru: 'AET', ceb: 'AET' }, abbr: 'AET' },
  { code: 'AU-WESTERN', iso: 'AU', name: 'Australia (Western)', zone: 'Australia/Perth', label: { en: 'AWST', ru: 'AWST', ceb: 'AWST' }, abbr: 'AWST' },
  { code: 'BR', name: 'Brazil', zone: 'America/Sao_Paulo', label: { en: 'BRT', ru: 'BRT', ceb: 'BRT' }, abbr: 'BRT' },
  { code: 'MX', name: 'Mexico', zone: 'America/Mexico_City', label: { en: 'CT', ru: 'CT', ceb: 'CT' }, abbr: 'CT' },
  { code: 'KZ', name: 'Kazakhstan', zone: 'Asia/Almaty', label: { en: 'ALMT', ru: 'ALMT', ceb: 'ALMT' }, abbr: 'ALMT' },
  { code: 'UA', name: 'Ukraine', zone: 'Europe/Kyiv', label: { en: 'Ukraine time', ru: 'время Украины', ceb: 'oras sa Ukraine' } },
  { code: 'BY', name: 'Belarus', zone: 'Europe/Minsk', label: { en: 'Belarus time', ru: 'время Беларуси', ceb: 'oras sa Belarus' } },
  { code: 'ID-WITA', iso: 'ID', name: 'Indonesia (Bali/Makassar)', zone: 'Asia/Makassar', label: { en: 'WITA', ru: 'WITA', ceb: 'WITA' }, abbr: 'WITA' },

  // Kosovo is not in ISO 3166-1, so it is not in the generated table; it is a
  // country a guest can plainly be in, and ICU has a name for it. Europe/Belgrade
  // is the IANA zone that covers it.
  { code: 'XK', name: 'Kosovo', zone: 'Europe/Belgrade', label: { en: 'Kosovo time', ru: 'время Косово', ceb: 'oras sa Kosovo' } },
];

const CURATED_BY_CODE = new Map(COUNTRY_ZONES.map((c) => [c.code, c]));
const ISO_BY_CODE = new Map(ISO_COUNTRIES.map((c) => [c.code, c]));

/** Offset of a zone at the ceremony instant, as the picker's fallback text. */
function ceremonyOffset(zone: string): string {
  return formatOffset(zoneOffsetMinutes(zone, new Date(EVENT.instant)));
}

function curatedEntry(entry: CuratedZone): CountryZone {
  return { ...entry, offset: ceremonyOffset(entry.zone) };
}

/** Build the selector entry for an ISO country the curated table does not cover. */
function generatedEntry(row: IsoCountry): CountryZone {
  return {
    code: row.code,
    name: row.name,
    zone: row.zone,
    label: {
      en: `${row.name} time`,
      ru: `время ${row.ru}`,
      ceb: `oras sa ${row.name}`,
    },
    offset: ceremonyOffset(row.zone),
    iso: row.code,
  };
}

let cached: readonly CountryZone[] | undefined;

/**
 * Every selectable country: the shortlist first, then the rest alphabetically.
 *
 * A country already covered by a curated entry (either its own code such as
 * "RO", or a subdivision such as "US-EASTERN" through `iso`) is not repeated as
 * a generic row — "United States" would silently assume one zone.
 */
export function allCountries(): readonly CountryZone[] {
  if (cached) return cached;

  const covered = new Set(COUNTRY_ZONES.map((c) => c.iso ?? c.code));
  const curated = COUNTRY_ZONES.map(curatedEntry);
  const generated = ISO_COUNTRIES.filter((row) => !covered.has(row.code)).map(generatedEntry);

  const shortlist = curated.filter((c) => c.shortlist);
  const rest = [...curated.filter((c) => !c.shortlist), ...generated].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  cached = [...shortlist, ...rest];
  return cached;
}

/** The entry for a country code, curated or generated; undefined if unknown. */
export function zoneForCountry(code: string): CountryZone | undefined {
  const curated = CURATED_BY_CODE.get(code);
  if (curated) return curatedEntry(curated);

  const row = ISO_BY_CODE.get(code);
  return row ? generatedEntry(row) : undefined;
}

/** ISO-8601 style offset such as "UTC+3" or "UTC-4:30". Never an abbreviation. */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const base = `UTC${sign}${hours}`;
  return minutes === 0 ? base : `${base}:${String(minutes).padStart(2, '0')}`;
}

export interface LocalTime {
  /** Wall-clock date and time at the destination, e.g. "Tuesday, 13 October 2026, 18:10". */
  readonly formatted: string;
  /** Wall-clock date only at the destination, e.g. "Tuesday, 13 October 2026". */
  readonly date: string;
  /** Numeric offset label, e.g. "UTC+3". */
  readonly offset: string;
}

const LOCALES: Record<Language, string> = {
  en: 'en-GB',
  ru: 'ru-RU',
  // Node's ICU ships a real Cebuano locale, so the date reads natively
  // ("Martes, Oktubre 13, 2026") instead of falling back to English.
  ceb: 'ceb',
};

/**
 * Convert the event instant into the guest's local time.
 *
 * The wall-clock time is derived from the library's offset rather than from
 * Intl's timeZone option. Intl would use Node's bundled ICU timezone data,
 * which lags IANA — for Morocco that means the clock face and the offset
 * label would disagree by an hour. Intl is still used for the *language*
 * (month and weekday names), which does not depend on timezone data.
 */
export function localTime(
  zone: string,
  language: Language,
  instant: Date = new Date(EVENT.instant),
): LocalTime {
  const offsetMinutesEast = zoneOffsetMinutes(zone, instant);
  const shifted = new Date(instant.getTime() + offsetMinutesEast * 60_000);

  const formatted = new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'short',
    hour12: false,
  }).format(shifted);

  // The cover states the day without a clock time, in the guest's own zone:
  // the date the ceremony falls on is not the same calendar day everywhere.
  const date = new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: 'UTC',
    dateStyle: 'full',
  }).format(shifted);

  return { formatted, date, offset: formatOffset(offsetMinutesEast) };
}

/**
 * The guest-facing name of the zone their invitation is based on.
 *
 * The label comes from the chosen country, never from a lookup by zone: two
 * countries can share a zone (Anguilla and Antigua both resolve to
 * America/Puerto_Rico), and naming the wrong one would be worse than naming
 * none.
 */
export function labelFor(
  country: Pick<CuratedZone, 'label'>,
  language: Language,
): string | undefined {
  return country.label[language];
}

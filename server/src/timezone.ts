/**
 * Country -> timezone resolution and guest-facing time formatting.
 *
 * Offsets are always computed from the IANA database at call time, never
 * stored, so a tzdata update is picked up on redeploy.
 */

import { EVENT, type Language } from './event.js';
import { offsetMinutes as zoneOffsetMinutes } from './tzdata.js';

export interface CountryZone {
  /** ISO 3166-1 alpha-2 code, or a custom code for sub-national entries. */
  readonly code: string;
  readonly name: string;
  /** IANA zone used as this country's default. */
  readonly zone: string;
  /** Short label in the guest's language, e.g. "МСК", "PHT". */
  readonly label: Partial<Record<Language, string>>;
  /** Pinned to the top of the selector. */
  readonly shortlist?: boolean;
}

/**
 * Deliberately short list of curated entries with human labels. Countries not
 * present fall back to a generated entry resolved from the full ISO list.
 */
export const COUNTRY_ZONES: readonly CountryZone[] = [
  { code: 'PH', name: 'Philippines', zone: 'Asia/Manila', label: { en: 'PHT', ru: 'PHT', ceb: 'PHT' }, shortlist: true },
  { code: 'RO', name: 'Romania', zone: 'Europe/Bucharest', label: { en: 'Romania time', ru: 'время Румынии', ceb: 'oras sa Romania' }, shortlist: true },
  { code: 'RU', name: 'Russia', zone: 'Europe/Moscow', label: { en: 'MSK', ru: 'МСК', ceb: 'MSK' }, shortlist: true },
  { code: 'HU', name: 'Hungary', zone: 'Europe/Budapest', label: { en: 'Hungary time', ru: 'время Венгрии', ceb: 'oras sa Hungary' }, shortlist: true },
  { code: 'MA', name: 'Morocco', zone: 'Africa/Casablanca', label: { en: 'Morocco time', ru: 'время Марокко', ceb: 'oras sa Morocco' }, shortlist: true },
  { code: 'VN', name: 'Vietnam', zone: 'Asia/Ho_Chi_Minh', label: { en: 'ICT', ru: 'ICT', ceb: 'ICT' }, shortlist: true },
  { code: 'ID', name: 'Indonesia', zone: 'Asia/Jakarta', label: { en: 'WIB', ru: 'WIB', ceb: 'WIB' }, shortlist: true },
  { code: 'NL', name: 'Netherlands', zone: 'Europe/Amsterdam', label: { en: 'Netherlands time', ru: 'время Нидерландов', ceb: 'oras sa Netherlands' }, shortlist: true },
  { code: 'PL', name: 'Poland', zone: 'Europe/Warsaw', label: { en: 'Poland time', ru: 'время Польши', ceb: 'oras sa Poland' }, shortlist: true },

  // Multi-zone countries your guests are likely to be in. Each entry states its
  // assumption in the label so the guest can see which zone we chose.
  { code: 'US-EASTERN', name: 'United States (Eastern)', zone: 'America/New_York', label: { en: 'US Eastern time', ru: 'восточное время США', ceb: 'Eastern time sa US' } },
  { code: 'US-CENTRAL', name: 'United States (Central)', zone: 'America/Chicago', label: { en: 'US Central time', ru: 'центральное время США', ceb: 'Central time sa US' } },
  { code: 'US-MOUNTAIN', name: 'United States (Mountain)', zone: 'America/Denver', label: { en: 'US Mountain time', ru: 'горное время США', ceb: 'Mountain time sa US' } },
  { code: 'US-PACIFIC', name: 'United States (Pacific)', zone: 'America/Los_Angeles', label: { en: 'US Pacific time', ru: 'тихоокеанское время США', ceb: 'Pacific time sa US' } },
  { code: 'CA-EASTERN', name: 'Canada (Eastern)', zone: 'America/Toronto', label: { en: 'Canada Eastern time', ru: 'восточное время Канады', ceb: 'Eastern time sa Canada' } },
  { code: 'CA-PACIFIC', name: 'Canada (Pacific)', zone: 'America/Vancouver', label: { en: 'Canada Pacific time', ru: 'тихоокеанское время Канады', ceb: 'Pacific time sa Canada' } },
  { code: 'AU-EASTERN', name: 'Australia (Eastern)', zone: 'Australia/Sydney', label: { en: 'Australia Eastern time', ru: 'восточное время Австралии', ceb: 'Eastern time sa Australia' } },
  { code: 'AU-WESTERN', name: 'Australia (Western)', zone: 'Australia/Perth', label: { en: 'Australia Western time', ru: 'западное время Австралии', ceb: 'Western time sa Australia' } },
  { code: 'BR', name: 'Brazil', zone: 'America/Sao_Paulo', label: { en: 'Brasília time', ru: 'время Бразилиа', ceb: 'oras sa Brasília' } },
  { code: 'MX', name: 'Mexico', zone: 'America/Mexico_City', label: { en: 'Mexico City time', ru: 'время Мехико', ceb: 'oras sa Mexico City' } },
  { code: 'KZ', name: 'Kazakhstan', zone: 'Asia/Almaty', label: { en: 'Almaty time', ru: 'время Алматы', ceb: 'oras sa Almaty' } },
  { code: 'UA', name: 'Ukraine', zone: 'Europe/Kyiv', label: { en: 'Kyiv time', ru: 'время Киева', ceb: 'oras sa Kyiv' } },
  { code: 'BY', name: 'Belarus', zone: 'Europe/Minsk', label: { en: 'Minsk time', ru: 'время Минска', ceb: 'oras sa Minsk' } },
  { code: 'ID-WITA', name: 'Indonesia (Bali/Makassar)', zone: 'Asia/Makassar', label: { en: 'WITA', ru: 'WITA', ceb: 'WITA' } },
];

const BY_CODE = new Map(COUNTRY_ZONES.map((c) => [c.code, c]));

export function zoneForCountry(code: string): CountryZone | undefined {
  return BY_CODE.get(code);
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
  /** Numeric offset label, e.g. "UTC+3". */
  readonly offset: string;
  /** Curated short label when available, e.g. "МСК"; otherwise undefined. */
  readonly label?: string;
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
 * The optional `label` is only attached when the zone matches the entry's own
 * zone, so an override can never inherit a misleading label.
 */
export function localTime(
  zone: string,
  language: Language,
  instant: Date = new Date(EVENT.instant),
): LocalTime {
  // The wall-clock time is derived from the library's offset rather than from
  // Intl's timeZone option. Intl would use Node's bundled ICU timezone data,
  // which lags IANA — for Morocco that means the clock face and the offset
  // label would disagree by an hour. Intl is still used for the *language*
  // (month and weekday names), which does not depend on timezone data.
  const offsetMinutesEast = zoneOffsetMinutes(zone, instant);
  const shifted = new Date(instant.getTime() + offsetMinutesEast * 60_000);

  const formatted = new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'short',
    hour12: false,
  }).format(shifted);

  const offset = formatOffset(offsetMinutesEast);

  const entry = COUNTRY_ZONES.find((c) => c.zone === zone);
  const curated = entry?.label[language];

  const result: LocalTime = { formatted, offset };
  return curated ? { ...result, label: curated } : result;
}

/** Shared types mirroring the server's API contract. */

export type Language = 'en' | 'ru' | 'ceb';
export type NumberForm = 'singular' | 'plural';
export type Gender = 'masculine' | 'feminine' | 'neutral';
/** Shape of the photograph's frame on the cover. */
export type PhotoShape = 'arched' | 'rectangular';

export interface CountryZone {
  code: string;
  name: string;
  zone: string;
  label: Partial<Record<Language, string>>;
  /** Multi-zone abbreviation shown in the picker, e.g. "ET". */
  abbr?: string;
  /** Offset at the ceremony instant, shown when there is no abbreviation. */
  offset: string;
  shortlist?: boolean;
}

export interface GenerationRequest {
  guests: string;
  language: Language;
  number: NumberForm;
  gender: Gender;
  countryCode: string;
  personalNote: string | null;
  photoShape: PhotoShape;
}

/**
 * A past generation, as history returns it.
 *
 * The guest's choices and nothing else: the markdown and the PDF are both built
 * from these, so a client that wants either asks for it rather than reading a
 * stored copy back.
 */
export interface HistoryEntry {
  id: string;
  createdAt: string;
  guests: string;
  language: Language;
  number: NumberForm;
  gender: Gender;
  countryCode: string;
  personalNote: string | null;
  photoShape: PhotoShape;
  filename: string;
}

/**
 * The invitation's text as returned by POST /api/preview.
 *
 * `markdown` is the exact source the PDF is built from; `filename` is the name
 * the PDF would be given, shown so it can be checked before generating.
 */
export interface PreviewResult {
  markdown: string;
  filename: string;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский (Russian)',
  ceb: 'Bisaya (Cebuano)',
};

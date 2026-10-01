/** Shared types mirroring the server's API contract. */

export type Language = 'en' | 'ru' | 'ceb';
export type NumberForm = 'singular' | 'plural';
export type Register = 'formal' | 'informal';
export type Gender = 'masculine' | 'feminine' | 'neutral';

export interface CountryZone {
  code: string;
  name: string;
  zone: string;
  label: Partial<Record<Language, string>>;
  shortlist?: boolean;
}

export interface GenerationRequest {
  guests: string;
  language: Language;
  number: NumberForm;
  register: Register;
  gender: Gender;
  countryCode: string;
  personalNote: string | null;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  guests: string;
  language: Language;
  number: NumberForm;
  register: Register;
  gender: Gender;
  countryCode: string;
  personalNote: string | null;
  filename: string;
}

export interface HistoryDetail extends HistoryEntry {
  markdown: string;
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

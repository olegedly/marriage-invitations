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

/**
 * Sample personal note, per language.
 *
 * The one placeholder in the form that becomes copy the guest reads: everything
 * else describes a choosing act, which is the same to read whatever language
 * the invitation is in. So it follows the language selector, and an operator
 * writing a Russian card is shown a Russian example rather than being nudged
 * into pasting an English sentence into it.
 *
 * Each is written in one person's voice, because the note is usually added by
 * whichever half of the couple decided to extend that invitation, and states a
 * fact about what that person does rather than a compliment or a thank-you. The
 * guest is left to conclude the rest; copy that says "this was written for you"
 * would defeat itself.
 *
 * The English alone is prefixed "e.g." — it is the one that reads as sample
 * prose to an English-speaking operator, and it is the one whose wording is a
 * plain sentence that could otherwise be mistaken for the couple's own voice
 * already filled in. The other two stand as the note itself.
 *
 * The Russian is the groom's voice. It has no gendered form at all — the first
 * person is present in "я делюсь", but nothing agrees with the speaker's gender
 * — so it would stay correct if the bride were the one writing. The Cebuano has
 * no gender agreement either, and has not been checked by a native speaker.
 */
export const NOTE_PLACEHOLDER: Record<Language, string> = {
  en: "e.g. I tell you things before I've told anyone else. I don't plan to stop.",
  ru: 'Есть вещи, которыми я делюсь только с тобой. И так будет всегда.',
  ceb: 'Ikaw ang una nakong sultian sa mga butang. Wala koy plano nga moundang.',
};

/**
 * Longest personal note the form and the API both accept.
 *
 * One value, declared where both sides can reach it. It used to be 400 in the
 * form and 600 in the API, so a script could store a note the form then refused
 * to load back for editing.
 */
export const NOTE_LIMIT = 400;

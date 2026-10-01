/**
 * Seam T1: the pure invitation renderer.
 *
 * renderInvitation(input) -> { markdown, filename }
 *
 * No PDF, no database, no HTTP. Everything guest-specific arrives in `input`;
 * everything constant comes from event.ts.
 */

import { EVENT, type Language } from './event.js';
import { localTime, zoneForCountry } from './timezone.js';
import { calendarUrl } from './calendar.js';

export type NumberForm = 'singular' | 'plural';
export type Register = 'formal' | 'informal';
export type Gender = 'masculine' | 'feminine' | 'neutral';

export interface GenerationInput {
  /** Free-form guest string: one person or several. Never parsed. */
  readonly guests: string;
  readonly language: Language;
  readonly number: NumberForm;
  readonly register: Register;
  readonly gender: Gender;
  /** Country code selecting the guest's timezone assumption. */
  readonly countryCode: string;
  /** Optional short hand-written paragraph for this guest. */
  readonly personalNote: string | null;
}

/** Map a language to the filename suffix. */
const FILENAME_LANG: Record<Language, string> = { en: 'EN', ru: 'RU', ceb: 'CEB' };

/**
 * Deterministic, filesystem-safe filename.
 *
 * Latin text is de-accented and joined without spaces ("Hanna Bekele" ->
 * "HannaBekele"). Scripts that have no ASCII form, such as Cyrillic, are kept
 * as-is rather than stripped, so distinct guests never collide on one name.
 * Only characters that are genuinely unsafe in a filename are removed.
 */
export function invitationFilename(guests: string, language: Language): string {
  const cleaned = guests
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const isLatin = /^[\p{Script=Latin}\p{N}\p{P}\p{Z}]*$/u.test(cleaned);

  const slug = isLatin
    ? cleaned
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('')
    : cleaned.replace(/\s+/g, '');

  return `Invitation_${slug.slice(0, 60) || 'Guest'}_${FILENAME_LANG[language]}.pdf`;
}

/** Render a person's name as a Facebook link when a profile is configured. */
function personName(person: typeof EVENT.groom, language: Language): string {
  const name = person[language];
  return person.facebook ? `[${name}](${person.facebook})` : name;
}

interface AddressCopy {
  readonly greeting: string;
}

/**
 * Greeting line, returned WITHOUT a trailing comma.
 *
 * The greeting is an adjective (or a bare salutation) that the guest's own name
 * completes: "Dear **Hanna Bekele**". A trailing noun such as "guests" would
 * repeat what the name already supplies, and the comma in front of it would
 * then be a comma with nothing after it. The renderer adds the name, so the
 * punctuation belongs to the name, not to this string.
 *
 * Russian varies by number, register and gender; the plural form collapses
 * gender entirely. English and Cebuano ignore gender.
 */
function greeting(input: GenerationInput): string {
  const { language, number, register, gender } = input;

  if (language === 'ru') {
    if (number === 'plural') {
      return register === 'formal' ? 'Уважаемые' : 'Дорогие';
    }
    if (register === 'formal') {
      return gender === 'feminine' ? 'Уважаемая' : 'Уважаемый';
    }
    return gender === 'feminine' ? 'Дорогая' : 'Дорогой';
  }

  if (language === 'ceb') {
    // Cebuano has no grammatical gender. To one person, formal and informal
    // address the same way, so register does not change the greeting.
    return number === 'plural' ? 'Minahal nga mga' : 'Minahal nga';
  }

  return 'Dear';
}

const YOU: Record<Language, { singular: string; plural: string }> = {
  en: { singular: 'you', plural: 'you' },
  ru: { singular: 'тебя', plural: 'вас' },
  ceb: { singular: 'ikaw', plural: 'kamo' },
};

const JOIN_CTA: Record<Language, string> = {
  en: 'Join the ceremony',
  ru: 'Присоединиться к церемонии',
  ceb: 'Apil sa seremonya',
};

const CALENDAR_CTA: Record<Language, string> = {
  en: 'Add to calendar',
  ru: 'Добавить в календарь',
  ceb: 'Idugang sa kalendaryo',
};

const CALENDAR_HINT: Record<Language, string> = {
  en: 'Downloads a calendar file that works with Google, Apple and Outlook.',
  ru: 'Скачивает файл календаря, который работает в Google, Apple и Outlook.',
  ceb: 'Mag-download og calendar file nga mogana sa Google, Apple ug Outlook.',
};

/**
 * Intro line, written per language and address form.
 *
 * Russian inflects the pronoun and the verb ending, so it cannot be assembled
 * from a shared stem: "видеть вас" (formal/plural) and "видеть тебя"
 * (informal singular) are different sentences.
 */
const INTRO: Record<Language, Record<'formalSingular' | 'informalSingular' | 'plural', string>> = {
  en: {
    formalSingular: 'We would be honored to have you with us as we say our vows.',
    informalSingular: 'We would love to have you with us as we say our vows.',
    plural: 'We would love to have you with us as we say our vows.',
  },
  ru: {
    formalSingular: 'Мы будем счастливы видеть вас рядом, когда мы произнесём наши клятвы.',
    informalSingular: 'Мы будем счастливы видеть тебя рядом, когда мы произнесём наши клятвы.',
    plural: 'Мы будем счастливы видеть вас рядом, когда мы произнесём наши клятвы.',
  },
  ceb: {
    // Cebuano has no gender. To one person, formal address uses the polite
    // plural ("kamo"); informal address uses the enclitic "ka" on the verb.
    formalSingular: 'Malipayon kami nga makauban kamo namo sa among pagpanumpa.',
    informalSingular: 'Malipayon kami nga makauban ka namo sa among pagpanumpa.',
    plural: 'Malipayon kami nga makauban kamo namo sa among pagpanumpa.',
  },
};

const NOTE_LEAD: Record<Language, string> = {
  en: 'A note for you',
  ru: 'Несколько слов для вас',
  ceb: 'Usa ka mensahe alang kanimo',
};

const CLOSING: Record<Language, string> = {
  en: 'With love,',
  ru: 'С любовью,',
  ceb: 'Uban sa gugma,',
};

const INTRO_FORMS = ['formalSingular', 'informalSingular', 'plural'] as const;
type IntroForm = (typeof INTRO_FORMS)[number];

function introForm(input: GenerationInput): IntroForm {
  if (input.number === 'plural') return 'plural';
  return input.register === 'formal' ? 'formalSingular' : 'informalSingular';
}

/**
 * Build the full invitation markdown.
 *
 * Structure (fixed, so the single CSS template can be tuned against it):
 *   # title / couple
 *   greeting + guest name
 *   intro
 *   [personal note block]        <- optional, never breaks the reading flow
 *   ## date and time
 *   ## join / add to calendar
 *   closing
 */
export interface RenderOptions {
  /**
   * Origin the invitation is being generated for, used to build the absolute
   * calendar link. A PDF has no base URL of its own, so this cannot be
   * relative and cannot be omitted.
   */
  readonly baseUrl: string;
}

export function renderInvitation(
  input: GenerationInput,
  options: RenderOptions,
): {
  markdown: string;
  filename: string;
} {
  const { language, guests, personalNote, countryCode } = input;

  const country = zoneForCountry(countryCode);
  if (!country) {
    // Falling back to the ceremony zone would silently send a guest the wrong
    // time, which is worse than failing loudly.
    throw new Error(`Unknown country code: ${countryCode}`);
  }
  const zone = country.zone;
  const time = localTime(zone, language);

  // One time only: the guest's own, labeled with the zone it is based on.
  //
  // A guest is told which zone THEIR time is in and nothing else. There is no
  // "the couple's time": the groom is in Romania and the bride is in the
  // Philippines, which is why the wedding is online. Naming either country to
  // an unrelated guest would raise a question they do not need answered.
  const parts = [time.offset];
  if (time.label) parts.push(time.label);
  const timeLine = `${time.formatted} — ${parts.join(', ')}`;

  const lines: string[] = [];

  lines.push(`# ${EVENT.title[language]}`);
  lines.push('');
  lines.push(
    `${personName(EVENT.groom, language)} & ${personName(EVENT.bride, language)}`,
  );
  lines.push('');
  lines.push(`${greeting(input)} **${guests}**`);
  lines.push('');
  lines.push(INTRO[language][introForm(input)]);
  lines.push('');

  if (personalNote && personalNote.trim()) {
    lines.push(`> ${NOTE_LEAD[language]}`);
    lines.push('>');
    for (const paragraph of personalNote.trim().split(/\n{2,}/)) {
      lines.push(`> ${paragraph.trim()}`);
      lines.push('>');
    }
    lines.pop();
    lines.push('');
  }

  lines.push(`## ${timeLine}`);
  lines.push('');
  lines.push(`[${JOIN_CTA[language]}](${EVENT.zoomLink})`);
  lines.push('');
  lines.push(`[${CALENDAR_CTA[language]}](${calendarUrl(options.baseUrl)})`);
  lines.push('');
  lines.push(CALENDAR_HINT[language]);
  lines.push('');
  lines.push(CLOSING[language]);
  lines.push('');
  lines.push(
    `${personName(EVENT.groom, language)} & ${personName(EVENT.bride, language)}`,
  );

  return {
    markdown: lines.join('\n'),
    filename: invitationFilename(guests, language),
  };
}

/** Exposed for the UI: the pronoun form that will be used for a given input. */
export function pronounFor(input: Pick<GenerationInput, 'language' | 'number'>): string {
  return YOU[input.language][input.number];
}

/**
 * Seam T1: the pure invitation renderer.
 *
 * renderInvitation(input) -> { markdown, filename }
 *
 * No PDF, no database, no HTTP. Everything guest-specific arrives in `input`;
 * everything constant comes from event.ts.
 */

import { EVENT, type EventConstants, type Language, type Person } from './event.js';
import { labelFor, localTime, zoneForCountry } from './timezone.js';
import { coverMarkup, type PhotoShape } from './cover.js';

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
  /**
   * Shape of the photograph's frame on the cover.
   *
   * The one choice here that changes nothing about the wording — it is a look,
   * not a reading. It rides in the input all the same, because it is chosen per
   * guest and a re-download has to reproduce the card that was sent rather than
   * today's default.
   */
  readonly photoShape: PhotoShape;
}

/** Map a language to the filename suffix. */
const FILENAME_LANG: Record<Language, string> = { en: 'EN', ru: 'RU', ceb: 'CEB' };

/**
 * Deterministic, filesystem-safe filename.
 *
 * Latin text is de-accented and joined without spaces ("Máté and Szandra" ->
 * "MateAndSzandra"). Scripts that have no ASCII form, such as Cyrillic, are
 * kept as-is rather than stripped, so distinct guests never collide on one
 * name. Only characters that are genuinely unsafe in a filename are removed.
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
function personName(person: Person, language: Language): string {
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
 * completes: "Dear **Loimie**". A trailing noun such as "guests" would
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

/**
 * The calendar call to action.
 *
 * The label names Google rather than the generic "add to calendar", because the
 * link opens the couple's own Google Calendar event: a label that says where the
 * tap leads is what replaces the explainer sentence that used to sit under it.
 * Nothing else about the calendar is said in the copy.
 */
const CALENDAR_CTA: Record<Language, string> = {
  en: 'Add to Google Calendar',
  ru: 'Добавить в Google Календарь',
  ceb: 'Idugang sa Google Calendar',
};

/**
 * Intro paragraph, written per language and address form.
 *
 * Russian and Cebuano inflect for the person addressed, so they cannot be
 * assembled from a shared stem: "разделить с вами" (formal/plural) against
 * "разделить с тобой" (informal singular), and the polite "makauban kamo"
 * against the enclitic "makauban ka". English marks no such distinction, so its
 * three forms are the same sentence.
 */
const INTRO: Record<Language, Record<'formalSingular' | 'informalSingular' | 'plural', string>> = {
  en: {
    formalSingular:
      'We would be delighted to have you with us on this special occasion. The online wedding ceremony is a video call in Zoom and takes only 30 minutes. Please join us in finding out whether online marriages are real! We sure hope they are :D',
    informalSingular:
      'We would be delighted to have you with us on this special occasion. The online wedding ceremony is a video call in Zoom and takes only 30 minutes. Please join us in finding out whether online marriages are real! We sure hope they are :D',
    plural:
      'We would be delighted to have you with us on this special occasion. The online wedding ceremony is a video call in Zoom and takes only 30 minutes. Please join us in finding out whether online marriages are real! We sure hope they are :D',
  },
  ru: {
    formalSingular:
      'Мы будем счастливы разделить с вами этот особенный день. Онлайн-церемония — это видеозвонок в Zoom, и она занимает всего 30 минут. Присоединяйтесь к нам, чтобы узнать: онлайн-браки — это скам или нет. Мы очень надеемся, что нет :D',
    informalSingular:
      'Мы будем счастливы разделить с тобой этот особенный день. Онлайн-церемония — это видеозвонок в Zoom, и она занимает всего 30 минут. Присоединяйся к нам, чтобы узнать: онлайн-браки — это скам или нет. Мы очень надеемся, что нет :D',
    plural:
      'Мы будем счастливы разделить с вами этот особенный день. Онлайн-церемония — это видеозвонок в Zoom, и она занимает всего 30 минут. Присоединяйтесь к нам, чтобы узнать: онлайн-браки — это скам или нет. Мы очень надеемся, что нет :D',
  },
  ceb: {
    // Cebuano has no gender. To one person, formal address uses the polite
    // plural ("kamo"); informal address uses the enclitic "ka" on the verb.
    formalSingular:
      'Malipayon kami nga makauban kamo namo niining espesyal nga okasyon. Ang online nga kasal kay usa ka video call sa Zoom ug mga 30 minutos ra. Apil uban namo aron mahibaloan kung tinuod ba ang mga kasal online! Hinaot nga tinuod gyud :D',
    informalSingular:
      'Malipayon kami nga makauban ka namo niining espesyal nga okasyon. Ang online nga kasal kay usa ka video call sa Zoom ug mga 30 minutos ra. Apil uban namo aron mahibaloan kung tinuod ba ang mga kasal online! Hinaot nga tinuod gyud :D',
    plural:
      'Malipayon kami nga makauban kamo namo niining espesyal nga okasyon. Ang online nga kasal kay usa ka video call sa Zoom ug mga 30 minutos ra. Apil uban namo aron mahibaloan kung tinuod ba ang mga kasal online! Hinaot nga tinuod gyud :D',
  },
};

const CLOSING: Record<Language, string> = {
  en: 'With love,',
  ru: 'С любовью,',
  ceb: 'Uban sa gugma,',
};

/**
 * The word between the two names.
 *
 * Russian joins names with "и", not with an ampersand: "Олег & Роуз" reads as
 * a typo to a Russian guest, and the ampersand is a Latin-typography habit
 * rather than a neutral symbol. English and Cebuano keep "&", which is the
 * convention on invitations in both.
 */
const CONJUNCTION: Record<Language, string> = {
  en: '&',
  ru: 'и',
  ceb: '&',
};

/** The couple, joined the way the language joins two names. */
function couple(event: EventConstants, language: Language): string {
  return `${personName(event.groom, language)} ${CONJUNCTION[language]} ${personName(
    event.bride,
    language,
  )}`;
}

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
 *   <section class="cover">      <- page one, raw HTML (see cover.ts)
 *   <section class="details">    <- page two, the invitation copy
 *     greeting + guest name      <- opens the page; the cover holds the title
 *     intro
 *     [personal note]            <- optional, the paragraphs after the intro
 *     ## date and time
 *     ## join / add to calendar
 *     closing
 *
 * The two sections are raw HTML; everything inside the details is ordinary
 * markdown. The template turns them into pages, so the order here is also the
 * reading order of the finished PDF.
 */
export interface RenderOptions {
  /**
   * Wedding constants to render with. Defaults to the live EVENT from event.ts,
   * which is what every request uses; the override exists so a test can stand
   * in for a redeploy that changed the constants, and so history can be
   * re-rendered with today's values.
   *
   * There is deliberately no base URL here. The invitation holds no link back
   * to the app it was generated on: the calendar call to action is the couple's
   * own Google Calendar event, and the .ics endpoint is an artifact the guest is
   * given on request rather than a link in the copy. A PDF has no base URL of
   * its own, so anything relative would have to be absolute and derived per
   * request, which is a whole configuration surface nobody needs to keep
   * correct.
   */
  readonly event?: EventConstants;
}

export function renderInvitation(
  input: GenerationInput,
  options: RenderOptions = {},
): {
  markdown: string;
  filename: string;
} {
  const { language, guests, personalNote, countryCode } = input;
  const event = options.event ?? EVENT;

  const country = zoneForCountry(countryCode);
  if (!country) {
    // Falling back to the ceremony zone would silently send a guest the wrong
    // time, which is worse than failing loudly.
    throw new Error(`Unknown country code: ${countryCode}`);
  }
  const zone = country.zone;
  const time = localTime(zone, language, new Date(event.instant));
  const label = labelFor(country, language);

  // One time only: the guest's own, labeled with the zone it is based on.
  //
  // A guest is told which zone THEIR time is in and nothing else. There is no
  // "the couple's time": the groom is in Romania and the bride is in the
  // Philippines, which is why the wedding is online. Naming either country to
  // an unrelated guest would raise a question they do not need answered.
  const parts = [time.offset];
  if (label) parts.push(label);
  const timeLine = `${time.formatted} — ${parts.join(', ')}`;

  const lines: string[] = [];

  // Page two is the letter itself. The cover has already said whose wedding it
  // is and shown the names, so the copy opens with the guest rather than
  // repeating a title and the couple above it.
  lines.push(`${greeting(input)} **${guests}**`);
  lines.push('');
  lines.push(INTRO[language][introForm(input)]);
  lines.push('');

  if (personalNote && personalNote.trim()) {
    // The note is ordinary copy and nothing else. It is not a blockquote: an
    // aside would set the couple's own words apart from the letter they are
    // part of. It carries no lead-in either ("A note for you" would state what
    // the greeting already says), so it is simply the paragraph that follows
    // the intro. A blank line the writer put in becomes a paragraph break of
    // its own rather than a separator inside one quoted block.
    for (const paragraph of personalNote.trim().split(/\n{2,}/)) {
      // A lone newline is joined rather than left in the line: markdown turns
      // a soft line break into a space when it renders the PDF, and the text
      // preview reads one line as one block, so joining it here is what keeps
      // the two showing the same paragraph.
      lines.push(paragraph.trim().replace(/\s*\n\s*/g, ' '));
      lines.push('');
    }
  }

  lines.push(`## ${timeLine}`);
  lines.push('');
  lines.push(`[${JOIN_CTA[language]}](${event.zoomLink})`);
  lines.push('');
  lines.push(`[${CALENDAR_CTA[language]}](${event.calendarLink})`);
  lines.push('');
  lines.push(CLOSING[language]);
  lines.push('');
  lines.push(couple(event, language));

  // Page one is the cover; page two is the invitation itself. The details are
  // wrapped in their own section because that section is what carries the
  // frame background, so the picture is scoped to the page it belongs to
  // instead of being positioned against a document that happens to be two
  // sheets tall (see templates/invitation.css).
  const cover = coverMarkup({
    // The cover carries the title, and page two no longer repeats it.
    label: event.title[language],
    groom: event.groom[language],
    bride: event.bride[language],
    conjunction: CONJUNCTION[language],
    date: time.date,
    venue: event.venue[language],
    shape: input.photoShape,
  });

  return {
    markdown: [
      cover,
      '',
      '<section class="details">',
      '',
      lines.join('\n'),
      '',
      '</section>',
    ].join('\n'),
    filename: invitationFilename(guests, language),
  };
}

/** Exposed for the UI: the pronoun form that will be used for a given input. */
export function pronounFor(input: Pick<GenerationInput, 'language' | 'number'>): string {
  return YOU[input.language][input.number];
}

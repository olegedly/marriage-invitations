/**
 * Single source of truth for every constant that appears in an invitation.
 *
 * Nothing here varies per guest. Anything that DOES vary per guest lives in the
 * generation input instead. Change a value here and redeploy; that is the
 * intended workflow (CI deploys on push).
 */

export type Language = 'en' | 'ru' | 'ceb';

/** A person's name rendered per language, plus an optional profile link. */
export interface Person {
  readonly en: string;
  readonly ru: string;
  readonly ceb: string;
  /** Rendered as a hyperlink on the invitation when present. */
  readonly facebook?: string;
}

export interface EventConstants {
  /** Absolute instant of the ceremony. All guest-facing times derive from this. */
  readonly instant: string;
  /** Video conference link guests join. */
  readonly zoomLink: string;
  /**
   * The couple's own Google Calendar event, as a share link.
   *
   * A constant because it appears in the invitation: the PDF's calendar call to
   * action points here, so every guest saves the same event the couple
   * maintain. It is deliberately not a generated template URL — an owned event
   * is one entry to keep correct rather than one prefilled copy per guest.
   *
   * The trade is that the event's own time is now a second place the ceremony
   * time lives. `instant` above still prints the time in the copy and builds the
   * .ics, so moving the wedding means editing both, and a mismatch is invisible
   * to this test suite. Treat the event as the guest-facing truth and update it
   * and `instant` together.
   */
  readonly calendarLink: string;
  readonly groom: Person;
  readonly bride: Person;
  /**
   * Title on the cover, above the photograph.
   *
   * It names the artifact — a wedding invitation — rather than the couple, who
   * are already named and pictured on the same page. Page two therefore opens
   * with the greeting instead of repeating a title and the names a second time.
   */
  readonly title: Record<Language, string>;
  /**
   * Where the ceremony happens, shown on the cover under the date.
   *
   * The wedding is online — the groom is in Romania and the bride in the
   * Philippines — so this is a place to gather rather than a place to travel
   * to. It is stated once, on the cover; the details page carries the link.
   */
  readonly venue: Record<Language, string>;
}

export const EVENT: EventConstants = {
  instant: '2026-10-13T18:10:00+03:00',
  zoomLink: 'https://app.acuityscheduling.com/schedule.php?owner=17450053&action=zoom&uniqueID=bb74147df95e0312d34e6cbb3c73ede5&ownerID=17450053',
  calendarLink: 'https://calendar.app.google/DgeTC485bonrtrJaA',
  groom: {
    en: 'Oleg',
    ru: 'Олег',
    ceb: 'Oleg',
    facebook: 'https://www.facebook.com/olegedly',
  },
  bride: {
    en: 'Rose',
    ru: 'Роуз',
    ceb: 'Rose',
    facebook: 'https://www.facebook.com/rosmarie.villabas.3',
  },
  title: {
    en: 'Wedding Invitation',
    ru: 'Приглашение на свадьбу',
    ceb: 'Imbitasyon sa Kasal',
  },
  venue: {
    en: 'Online',
    ru: 'Онлайн',
    ceb: 'Online',
  },
};

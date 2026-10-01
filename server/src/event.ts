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
  readonly groom: Person;
  readonly bride: Person;
  /** Invitation title shown on the card. */
  readonly title: Record<Language, string>;
}

export const EVENT: EventConstants = {
  instant: '2026-10-13T18:10:00+03:00',
  zoomLink: 'https://app.acuityscheduling.com/schedule.php?owner=17450053&action=zoom&uniqueID=bb74147df95e0312d34e6cbb3c73ede5&ownerID=17450053',
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
    en: 'Our Wedding',
    ru: 'Наша свадьба',
    ceb: 'Among Kasal',
  },
};

/**
 * Operator override for the app's public base URL.
 *
 * Returns undefined when unset, which is the normal case: the origin is then
 * derived from the request (see requestOrigin in app.ts). There is deliberately
 * no hardcoded fallback — a constant such as `http://localhost:3000` would
 * silently win over a correct request origin and produce dead links in every
 * guest's PDF.
 */
export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  return value || undefined;
}

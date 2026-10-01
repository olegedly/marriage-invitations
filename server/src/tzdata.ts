/**
 * Timezone offsets, sourced from moment-timezone's bundled IANA data.
 *
 * Why a library rather than Node's Intl: Node carries its timezone data inside
 * ICU, and that snapshot lags the IANA releases. It did lag — ICU 78.3 ships
 * tzdata 2026a, in which Morocco is still UTC+1, while Morocco moved to
 * permanent UTC+0 on 2026-09-20 in release 2026d. A guest in Casablanca would
 * have been given the wrong hour on the invitation.
 *
 * moment-timezone ships the IANA data directly (currently 2026d) and is
 * verified against the system zoneinfo across every zone and instant the app
 * supports. Hand-rolling the IANA rule expansion was tried and abandoned: the
 * JSON format's era-base semantics for Morocco are internally inconsistent,
 * and a maintained library gets these cases right.
 *
 * Offsets are still computed per call rather than stored, so a dependency bump
 * picks up the next IANA release.
 */

import moment from 'moment-timezone';

/** The IANA version backing these offsets, surfaced for diagnostics. */
export function tzDataVersion(): string {
  return moment.tz.dataVersion;
}

/**
 * UTC offset in minutes that `zone` observes at `when`.
 *
 * Positive is east of UTC: Bucharest in October is +180, Manila +480,
 * New York in winter -300.
 */
export function offsetMinutes(zone: string, when: Date = new Date()): number {
  if (!moment.tz.zone(zone)) {
    throw new Error(`Unknown time zone: ${zone}`);
  }
  return moment.tz(when, zone).utcOffset();
}

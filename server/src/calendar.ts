/**
 * Seam T3b: the .ics artifact.
 *
 * The invitation's calendar call to action does not come from here: it links to
 * the couple's own Google Calendar event (`calendarLink` in event.ts), which is
 * a constant. This file builds the other shape — an .ics file for a guest who is
 * not on Gmail. The route serves it on request; nothing links to it.
 *
 * Instants are always UTC so each client localises to the guest's own zone. The
 * time in the invitation copy is the guest's own local time; this is the same
 * instant.
 */

import { EVENT } from './event.js';

/** Event length assumed for the calendar entry. */
const DURATION_MINUTES = 60;

/** Format a Date as an iCalendar UTC stamp: 20261013T151000Z */
function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

/**
 * Escape a value for an iCalendar text field.
 * Backslash first, so we do not double-escape what we add.
 */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long lines per RFC 5545 so strict parsers accept the file. */
function foldLine(line: string): string {
  const LIMIT = 75;
  if (line.length <= LIMIT) return line;

  const parts: string[] = [line.slice(0, LIMIT)];
  let rest = line.slice(LIMIT);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, LIMIT - 1)}`);
    rest = rest.slice(LIMIT - 1);
  }
  return parts.join('\r\n');
}

function eventWindow(): { start: Date; end: Date } {
  const start = new Date(EVENT.instant);
  const end = new Date(start.getTime() + DURATION_MINUTES * 60_000);
  return { start, end };
}

function summary(): string {
  return `${EVENT.groom.en} & ${EVENT.bride.en} — Wedding`;
}

function description(): string {
  return [
    `Join us online for the wedding of ${EVENT.groom.en} and ${EVENT.bride.en}.`,
    '',
    `Video call: ${EVENT.zoomLink}`,
  ].join('\n');
}

export function icsFilename(): string {
  return 'Oleg-Rose-Wedding.ics';
}

/**
 * Build the .ics file contents.
 *
 * English, because the route that serves this file has no idea who is asking:
 * it is the artifact the couple hands to a guest who is not on Gmail, not
 * something the renderer produces per invitation. Nothing links to it, so there
 * is no language to inherit.
 */
export function buildIcs(): string {
  const { start, end } = eventWindow();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//marriage-invitations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsStamp(start)}-wedding@marriage-invitations`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    foldLine(`SUMMARY:${escapeIcs(summary())}`),
    foldLine(`DESCRIPTION:${escapeIcs(description())}`),
    foldLine(`LOCATION:${escapeIcs(EVENT.zoomLink)}`),
    foldLine(`URL:${escapeIcs(EVENT.zoomLink)}`),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // The spec mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}

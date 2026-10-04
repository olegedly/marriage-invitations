import { describe, expect, test } from 'vitest';
import { renderInvitation, type GenerationInput } from '../src/render.js';
import { EVENT } from '../src/event.js';
import { guestInput } from './support/render.js';

/**
 * Seam T1c: the calendar call to action inside an invitation.
 *
 * The link is the couple's own Google Calendar event, held as a constant in
 * event.ts. It used to point at an .ics endpoint of ours, which meant a file
 * download, leaving the PDF, finding the file, and choosing an app to open it
 * with. Between those two it briefly pointed at a generated Google Calendar
 * template URL — a prefilled copy of the event per guest — but an event the
 * couple own is one entry to keep correct instead of one per guest.
 *
 * That link was also the only reason the renderer ever needed the origin the
 * request arrived on: a PDF has no base URL of its own, so a self-referential
 * link had to be absolute. An external link is absolute already, so the renderer
 * takes no origin at all (see RenderOptions in src/render.ts).
 *
 * The .ics itself survives at GET /api/calendar.ics for a guest who is not on
 * Gmail and asks for a file. It is simply no longer advertised in the copy.
 */

/** Philippines, so the fixture is a guest in a different zone from the couple. */
const base = (over: Partial<GenerationInput> = {}): GenerationInput =>
  guestInput({ countryCode: 'PH', ...over });

describe('calendar call to action in the invitation', () => {
  test('links to the couple’s own calendar event', () => {
    const { markdown } = renderInvitation(base());

    expect(markdown).toContain(`[Add to Google Calendar](${EVENT.calendarLink})`);
  });

  test('the link is whatever the constants say, not a copy baked into the renderer', () => {
    // A redeploy can repoint the event without touching the renderer, and the
    // re-render path (GET /api/history/:id/pdf) picks the new link up for a past
    // guest.
    const { markdown } = renderInvitation(base(), {
      event: { ...EVENT, calendarLink: 'https://calendar.app.google/other-event' },
    });

    expect(markdown).toContain(
      '[Add to Google Calendar](https://calendar.app.google/other-event)',
    );
    expect(markdown).not.toContain(EVENT.calendarLink);
  });

  test('no longer advertises a downloadable .ics file', () => {
    const { markdown } = renderInvitation(base());

    // Neither the link nor the explainer sentence that existed to justify a
    // file download.
    expect(markdown).not.toContain('.ics');
    expect(markdown).not.toContain('Downloads a calendar file');
  });

  test('the join call to action is still the configured conference link', () => {
    const { markdown } = renderInvitation(base());

    expect(markdown).toContain(`[Join the ceremony](${EVENT.zoomLink})`);
  });

  test('the label follows the invitation language', () => {
    const ru = renderInvitation(base({ language: 'ru' })).markdown;
    const ceb = renderInvitation(base({ language: 'ceb' })).markdown;

    expect(ru).toContain('[Добавить в Google Календарь](');
    expect(ceb).toContain('[Idugang sa Google Calendar](');
  });

  test('a Russian invitation carries no English names', () => {
    // The generated template URL used to embed an event title, which is how
    // Latin names got into a Russian artifact. A constant link cannot.
    const { markdown } = renderInvitation(base({ language: 'ru' }));

    expect(markdown).not.toContain('Oleg');
    expect(markdown).not.toContain('Rose');
  });
});

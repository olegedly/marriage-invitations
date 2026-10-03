/**
 * The save-the-date cover: page one of the invitation PDF.
 *
 * This is authored as HTML rather than markdown because on this page the layout
 * IS the content: an arched photograph, the names stacked in a script face, a
 * hairline rule. Markdown has no syntax for any of it, and the ways around that
 * — positional CSS keyed to paragraph order, or a script injected into the
 * renderer to rearrange the DOM — are more fragile than the markup they avoid.
 *
 * The cover is part of the markdown record, not a layer added at PDF time, so a
 * re-download from history reproduces exactly the cover the guest was sent. The
 * class names below are the contract with templates/invitation.css.
 */

/**
 * Cover photograph, relative to the templates directory.
 *
 * The PDF renderer serves that directory over HTTP and points Chromium at it
 * (see pdf.ts), which is what makes a relative path work inside a PDF: the
 * document has no base URL of its own, so an absolute filesystem path would
 * bake this machine's layout into every generated file.
 */
export const COVER_PHOTO = 'images/photo.jpg';

export interface CoverData {
  /** Localised "Save the date". */
  readonly label: string;
  readonly groom: string;
  readonly bride: string;
  /**
   * The word joining the two names, per language: "&" in English and Cebuano,
   * "и" in Russian. Passed in rather than fixed here because it is language,
   * not decoration.
   */
  readonly conjunction: string;
  /** Full date in the guest's own zone, e.g. "Tuesday, 13 October 2026". */
  readonly date: string;
  readonly venue: string;
}

/** Escape a value for use in HTML text or a double-quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The cover as one raw-HTML block.
 *
 * Every element sits on its own line: the text preview reads the markdown line
 * by line (see client/src/preview-text.ts), and stripping the tags from one
 * element per line is what lets the operator proofread the cover's wording
 * alongside the rest of the invitation.
 */
export function coverMarkup(data: CoverData): string {
  const groom = escapeHtml(data.groom);
  const bride = escapeHtml(data.bride);
  const alt = escapeHtml(`${data.groom} ${data.conjunction} ${data.bride}`);

  return [
    '<section class="cover">',
    `<p class="cover-kicker">${escapeHtml(data.label)}</p>`,
    '<figure class="cover-photo">',
    `<img src="${COVER_PHOTO}" alt="${alt}">`,
    '</figure>',
    '<div class="cover-names">',
    `<p class="cover-name">${groom}</p>`,
    `<p class="cover-and">${escapeHtml(data.conjunction)}</p>`,
    `<p class="cover-name">${bride}</p>`,
    '</div>',
    `<p class="cover-date">${escapeHtml(data.date)}</p>`,
    `<p class="cover-venue">${escapeHtml(data.venue)}</p>`,
    '</section>',
  ].join('\n');
}

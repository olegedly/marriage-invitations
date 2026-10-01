/**
 * Content-Disposition construction.
 *
 * Guest names may be Cyrillic, and raw non-ASCII bytes are illegal in an HTTP
 * header — Node throws ERR_INVALID_CHAR and the whole response 500s. RFC 6266
 * solves this with two parameters: a plain ASCII `filename` for old clients
 * and a percent-encoded UTF-8 `filename*` that modern browsers prefer.
 */

/** Reduce a filename to characters that are always safe in a header. */
function asciiFallback(filename: string): string {
  const transliterated = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '');

  // Keep the extension even if the stem was entirely non-ASCII.
  const cleaned = transliterated.replace(/[\\"]/g, '').trim();
  if (/\.\w+$/.test(cleaned) && cleaned.replace(/\.\w+$/, '').length > 0) {
    return cleaned;
  }

  const ext = /\.\w+$/.exec(filename)?.[0] ?? '';
  const stem = cleaned.replace(/\.\w+$/, '').replace(/[^A-Za-z0-9_-]/g, '');
  return `${stem || 'invitation'}${ext || '.pdf'}`;
}

/**
 * Build a Content-Disposition header value that works for ASCII and non-ASCII
 * filenames alike.
 */
export function contentDisposition(filename: string): string {
  const fallback = asciiFallback(filename);

  // encodeURIComponent leaves a few characters the spec wants escaped.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Thin API client. Keeps fetch details out of the components. */

import type {
  CountryZone,
  GenerationRequest,
  HistoryEntry,
  PreviewResult,
} from './types.js';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCountries(): Promise<CountryZone[]> {
  return json<CountryZone[]>(await fetch('/api/countries'));
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  return json<HistoryEntry[]>(await fetch('/api/history'));
}

/**
 * Render the invitation's text, without generating a PDF.
 *
 * Returns the same markdown the PDF would be built from, so what the operator
 * approves here is what the guest receives. Nothing is saved to history.
 */
export async function previewInvitation(
  input: GenerationRequest,
): Promise<PreviewResult> {
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  return json<PreviewResult>(res);
}

/**
 * Generate an invitation and hand the PDF to the browser.
 *
 * The server sets Content-Disposition, so the download keeps the server's
 * deterministic filename rather than one invented here.
 */
export async function generateInvitation(input: GenerationRequest): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Generation failed (${res.status})`);
  }

  const blob = await res.blob();
  const filename = filenameFrom(res.headers.get('content-disposition')) ?? 'invitation.pdf';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Extract a filename from a Content-Disposition header.
 *
 * RFC 6266 gives the header two filename parameters: an ASCII `filename` that
 * cannot carry Cyrillic, and a percent-encoded UTF-8 `filename*`. `filename*`
 * wins when both are present — reading the plain one first would save every
 * Russian guest as `Invitation__RU.pdf`, since their name has no ASCII form.
 */
export function filenameFrom(header: string | null): string | null {
  if (!header) return null;

  // filename*=UTF-8''<percent-encoded>, with the charset and optional language
  // in single quotes ahead of the value (RFC 6266 §4.1).
  const extended = /filename\*\s*=\s*([\w-]+)'([\w-]*)'([^;]*)/i.exec(header);
  if (extended?.[3]) return decodeExtended(extended[3]);

  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  const value = (plain?.[1] ?? plain?.[2])?.trim();
  return value ? value : null;
}

/** Percent-decode a filename* value, keeping the raw text if it is malformed. */
function decodeExtended(value: string): string {
  const unquoted = value.trim().replace(/^"|"$/g, '');
  try {
    return decodeURIComponent(unquoted);
  } catch {
    return unquoted;
  }
}

/**
 * Build a past invitation again and hand the PDF to the browser.
 *
 * Only the guest's choices are kept, so this always renders the invitation from
 * them using the wedding details in force now: a corrected Zoom link or a moved
 * date reaches the guest on a re-download.
 */
export async function downloadHistoryPdf(id: string): Promise<void> {
  const res = await fetch(`/api/history/${encodeURIComponent(id)}/pdf`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const blob = await res.blob();
  const filename = filenameFrom(res.headers.get('content-disposition')) ?? 'invitation.pdf';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Thin API client. Keeps fetch details out of the components. */

import type {
  CountryZone,
  GenerationRequest,
  HistoryDetail,
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

export async function fetchHistoryEntry(id: string): Promise<HistoryDetail> {
  return json<HistoryDetail>(await fetch(`/api/history/${encodeURIComponent(id)}`));
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

/** Extract a filename from a Content-Disposition header. */
export function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Which rendering of a past invitation to fetch. */
export type HistoryPdfVariant = 'original' | 'current';

/**
 * Re-download a past invitation.
 *
 * `original` serves the invitation exactly as it was first generated, so the
 * record of what was sent stays intact. `current` re-renders it from the same
 * stored guest choices using the wedding details in force now, so a link or
 * date corrected since then reaches the guest on a re-download.
 */
export async function downloadHistoryPdf(
  id: string,
  variant: HistoryPdfVariant = 'original',
): Promise<void> {
  const path =
    variant === 'current'
      ? `/api/history/${encodeURIComponent(id)}/pdf/current`
      : `/api/history/${encodeURIComponent(id)}/pdf`;

  const res = await fetch(path);
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

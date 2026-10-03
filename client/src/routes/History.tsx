import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  downloadHistoryPdf,
  fetchHistory,
  fetchHistoryEntry,
  type HistoryPdfVariant,
} from '../api.js';
import { LANGUAGE_LABELS, type GenerationRequest, type HistoryDetail, type HistoryEntry } from '../types.js';

const GENDER_LABELS: Record<string, string> = {
  masculine: 'masc.',
  feminine: 'fem.',
  neutral: '',
};

export function History(props: { onReuse: (request: GenerationRequest) => void }) {
  const [entries, setEntries] = createSignal<HistoryEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal<HistoryDetail | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }

  void load();

  async function toggle(id: string) {
    if (expanded()?.id === id) {
      setExpanded(null);
      return;
    }
    try {
      setExpanded(await fetchHistoryEntry(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that invitation');
    }
  }

  async function download(id: string, variant: HistoryPdfVariant) {
    setBusy(`${id}:${variant}`);
    setError(null);
    try {
      await downloadHistoryPdf(id, variant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  /** One download per entry at a time, so the two buttons cannot race. */
  const busyOn = (id: string) => busy()?.startsWith(`${id}:`) ?? false;

  const grouped = createMemo(() =>
    entries().map((entry) => ({
      ...entry,
      when: new Date(entry.createdAt).toLocaleString(),
    })),
  );

  return (
    <section class="history">
      <div class="history-head">
        <h2>History</h2>
        <button type="button" class="ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <Show when={error()}>
        <p class="error">{error()}</p>
      </Show>

      <Show when={loading()}>
        <p class="muted">Loading…</p>
      </Show>

      <Show when={!loading() && entries().length === 0}>
        <p class="muted">
          Nothing yet. Generated invitations will appear here, and can be downloaded
          again at any time.
        </p>
      </Show>

      <ul class="history-list">
        <For each={grouped()}>
          {(entry) => (
            <li class="history-item">
              <div class="history-row">
                <div class="history-main">
                  <strong>{entry.guests}</strong>
                  <span class="tags">
                    <span class="tag">{LANGUAGE_LABELS[entry.language]}</span>
                    <span class="tag">{entry.number}</span>
                    <span class="tag">{entry.register}</span>
                    <Show when={entry.gender !== 'neutral'}>
                      <span class="tag">{GENDER_LABELS[entry.gender]}</span>
                    </Show>
                    <span class="tag">{entry.countryCode}</span>
                    {/* Shown only when it is not the default, like gender. */}
                    <Show when={entry.photoShape === 'arched'}>
                      <span class="tag">arched</span>
                    </Show>
                  </span>
                  <Show when={entry.personalNote}>
                    <span class="note-preview">“{entry.personalNote}”</span>
                  </Show>
                </div>
                <div class="history-actions">
                  <span class="when">{entry.when}</span>
                  <button type="button" class="ghost" onClick={() => void toggle(entry.id)}>
                    {expanded()?.id === entry.id ? 'Hide' : 'View'}
                  </button>
                  <button
                    type="button"
                    class="ghost"
                    title="Open a new invitation with these choices"
                    onClick={() => props.onReuse(entry)}
                  >
                    Reuse
                  </button>
                  <button
                    type="button"
                    class="ghost"
                    title="Exactly as it was first generated"
                    disabled={busyOn(entry.id)}
                    onClick={() => void download(entry.id, 'original')}
                  >
                    {busy() === `${entry.id}:original` ? '…' : 'Original'}
                  </button>
                  <button
                    type="button"
                    class="ghost"
                    title="Re-rendered with the current wedding details"
                    disabled={busyOn(entry.id)}
                    onClick={() => void download(entry.id, 'current')}
                  >
                    {busy() === `${entry.id}:current` ? '…' : 'Updated'}
                  </button>
                </div>
              </div>

              <Show when={expanded()?.id === entry.id}>
                <p class="muted history-caption">Text as originally generated.</p>
                <pre class="markdown-view">{expanded()!.markdown}</pre>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

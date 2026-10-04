import { createMemo, createSignal, For, Show } from 'solid-js';
import { downloadHistoryPdf, fetchHistory, previewInvitation } from '../api.js';
import { PreviewText } from '../components/Preview.js';
import { LANGUAGE_LABELS, type GenerationRequest, type HistoryEntry } from '../types.js';

const GENDER_LABELS: Record<string, string> = {
  masculine: 'masc.',
  feminine: 'fem.',
  neutral: '',
};

/**
 * The choices an entry was generated with, as the API takes them.
 *
 * Built field by field rather than spread: the entry also carries its id, its
 * timestamp and its filename, none of which are part of a generation request.
 */
function requestOf(entry: HistoryEntry): GenerationRequest {
  return {
    guests: entry.guests,
    language: entry.language,
    number: entry.number,
    register: entry.register,
    gender: entry.gender,
    countryCode: entry.countryCode,
    personalNote: entry.personalNote,
    photoShape: entry.photoShape,
  };
}

export function History(props: { onAmend: (request: GenerationRequest) => void }) {
  const [entries, setEntries] = createSignal<HistoryEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal<{ id: string; markdown: string } | null>(null);
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

  /**
   * Read the invitation's text again.
   *
   * There is no stored markdown to fetch — history keeps the guest's choices
   * and nothing else — so the copy is rendered from those choices, by the same
   * server call the generation form's preview uses.
   */
  async function toggle(entry: HistoryEntry) {
    if (expanded()?.id === entry.id) {
      setExpanded(null);
      return;
    }
    setBusy(`${entry.id}:preview`);
    setError(null);
    try {
      const { markdown } = await previewInvitation(requestOf(entry));
      setExpanded({ id: entry.id, markdown });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that invitation');
    } finally {
      setBusy(null);
    }
  }

  async function download(id: string) {
    setBusy(`${id}:download`);
    setError(null);
    try {
      await downloadHistoryPdf(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  /** One action per entry at a time, so the buttons cannot race. */
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
          Nothing yet. Generated invitations will appear here, and can be built
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
                  <button
                    type="button"
                    class="ghost"
                    disabled={busyOn(entry.id)}
                    onClick={() => void toggle(entry)}
                  >
                    {busy() === `${entry.id}:preview`
                      ? '…'
                      : expanded()?.id === entry.id
                        ? 'Hide'
                        : 'Preview'}
                  </button>
                  <button
                    type="button"
                    class="ghost"
                    title="Build this invitation again and download it"
                    disabled={busyOn(entry.id)}
                    onClick={() => void download(entry.id)}
                  >
                    {busy() === `${entry.id}:download` ? '…' : 'Download'}
                  </button>
                  <button
                    type="button"
                    class="ghost"
                    title="Open a new invitation with these choices"
                    onClick={() => props.onAmend(entry)}
                  >
                    Amend
                  </button>
                </div>
              </div>

              <Show when={expanded()?.id === entry.id}>
                <div class="history-preview">
                  <p class="muted history-caption">
                    The copy as it would be generated now.
                  </p>
                  <div class="preview-body">
                    <PreviewText markdown={expanded()!.markdown} />
                  </div>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

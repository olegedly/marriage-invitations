import { For, Show } from 'solid-js';
import { parseMarkdown, type InlineNode } from '../preview-text.js';

/**
 * The invitation's text contents, for reading before generating.
 *
 * This is not a layout or typography preview — the PDF's stylesheet is
 * deliberately not reused here (see README). What it shows is the copy: the
 * exact wording the guest will receive, in their language and address form.
 */
export function Preview(props: {
  markdown: string | null;
  filename: string | null;
  loading: boolean;
  error: string | null;
  /** Shown before anything has been typed, so the panel is not just blank. */
  idle: boolean;
}) {
  return (
    <aside class="card preview" aria-live="polite">
      <h2>Preview text</h2>

      <Show when={props.idle}>
        <p class="muted">
          Enter a guest name to see the invitation's text here. It updates as you
          change the form, and nothing is generated until you ask for the PDF.
        </p>
      </Show>

      <Show when={props.error}>
        <p class="error">{props.error}</p>
      </Show>

      <Show when={props.markdown}>
        <div class={['preview-body', { stale: props.loading }]}>
          <For each={parseMarkdown(props.markdown!)}>
            {(block) => {
              const content = () => (
                <For each={block.inline}>
                  {(node) => <Inline node={node} />}
                </For>
              );

              return (
                <Show when={block.kind === 'heading'} fallback={
                  <p class="preview-line">{content()}</p>
                }>
                  <h3 class="preview-time">{content()}</h3>
                </Show>
              );
            }}
          </For>
        </div>

        <Show when={props.filename}>
          <p class="preview-filename">
            Will be saved as <code>{props.filename}</code>
          </p>
        </Show>
      </Show>
    </aside>
  );
}

/**
 * Links render as their own label.
 *
 * The calendar link's URL is a short Google Calendar address for the couple's
 * own event; showing it would put a raw URL in the middle of the copy being
 * proofread.
 */
function Inline(props: { node: InlineNode }) {
  return (
    <Show when={props.node.kind === 'strong'} fallback={
      <Show when={props.node.kind === 'link'} fallback={
        <>{props.node.value}</>
      }>
        <span class="preview-link">{props.node.value}</span>
      </Show>
    }>
      <strong>{props.node.value}</strong>
    </Show>
  );
}

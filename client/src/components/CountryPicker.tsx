import { createMemo, createSignal, For, Show } from 'solid-js';
import type { CountryZone } from '../types.js';

/**
 * Searchable country picker.
 *
 * Shortlisted countries are pinned to the top and the list is filtered as the
 * user types, matching on country name, code, zone, the guest-facing label
 * ("мск", "Philippines time") and the right-hand text actually on screen
 * ("ET", "UTC+5:30") so a guest can be found by whatever the operator reads.
 */
export function CountryPicker(props: {
  countries: CountryZone[];
  value: string;
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);

  const selected = createMemo(() =>
    props.countries.find((c) => c.code === props.value),
  );

  const matches = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return props.countries;

    return props.countries.filter((c) => {
      const labels = Object.values(c.label).join(' ').toLowerCase();
      const shown = (c.abbr ?? c.offset).toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.zone.toLowerCase().includes(q) ||
        labels.includes(q) ||
        shown.includes(q)
      );
    });
  });

  return (
    <div class="picker">
      <button
        type="button"
        class="picker-trigger"
        onClick={() => setOpen(!open())}
        aria-expanded={open() ? 'true' : 'false'}
      >
        <Show when={selected()} fallback={<span class="muted">Choose a country…</span>}>
          <span>{selected()!.name}</span>
          <span class="pill">{selected()!.abbr ?? selected()!.offset}</span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="picker-panel">
          <input
            class="picker-search"
            type="text"
            placeholder="Search countries…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            ref={(el) => queueMicrotask(() => el.focus())}
          />
          <ul class="picker-list">
            <For each={matches()}>
              {(country) => (
                <li>
                  <button
                    type="button"
                    class={{ 'picker-option': true, selected: country.code === props.value }}
                    onClick={() => {
                      props.onChange(country.code);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span class="picker-name">
                      <Show when={country.shortlist}>
                        <span class="star" title="Frequently used">
                          ★
                        </span>
                      </Show>
                      {country.name}
                    </span>
                    <span class="picker-tz">{country.abbr ?? country.offset}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={matches().length === 0}>
            <p class="muted pad">No countries match “{query()}”.</p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

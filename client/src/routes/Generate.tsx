import { createEffect, createMemo, createSignal, onSettled, Show } from 'solid-js';
import { CountryPicker } from '../components/CountryPicker.js';
import { Preview } from '../components/Preview.js';
import { generateInvitation, previewInvitation } from '../api.js';
import {
  LANGUAGE_LABELS,
  type CountryZone,
  type Gender,
  type GenerationRequest,
  type Language,
  type NumberForm,
  type PhotoShape,
  type Register,
} from '../types.js';

export function Generate(props: {
  countries: CountryZone[];
  /**
   * Choices to start the form with, taken from a history entry. Read once, at
   * mount: later edits are the operator's, not the record's.
   */
  initial?: GenerationRequest | null;
  /** Called once the prefill has been taken, so it is not applied again. */
  onInitialConsumed?: () => void;
  onGenerated: () => void;
}) {
  // Captured at creation. A later change to props.initial must not overwrite
  // what the operator has since typed.
  const initial = props.initial ?? null;

  const [guests, setGuests] = createSignal(initial?.guests ?? '');
  // Language and country are independent choices: country picks the timezone
  // only, never the language. The defaults are deliberately the most common
  // path (the bride's country, an English invitation) rather than an odd
  // pairing such as English copy addressed to a Romanian guest.
  const [language, setLanguage] = createSignal<Language>(initial?.language ?? 'en');
  const [number, setNumber] = createSignal<NumberForm>(initial?.number ?? 'singular');
  const [register, setRegister] = createSignal<Register>(initial?.register ?? 'formal');
  const [gender, setGender] = createSignal<Gender>(initial?.gender ?? 'neutral');
  const [countryCode, setCountryCode] = createSignal(initial?.countryCode ?? 'PH');
  const [personalNote, setPersonalNote] = createSignal(initial?.personalNote ?? '');
  const [photoShape, setPhotoShape] = createSignal<PhotoShape>(
    initial?.photoShape ?? 'arched',
  );
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [done, setDone] = createSignal<string | null>(null);

  /** Whether this form is a re-run of a past entry, for the notice below. */
  const [reused] = createSignal(initial !== null);

  // Release the prefill so navigating back to Generate starts a blank form.
  // onSettled rather than setup: writing the parent's signal during the
  // component body is disallowed in Solid 2, and the value has been read by now.
  onSettled(() => {
    if (initial !== null) props.onInitialConsumed?.();
  });

  const [preview, setPreview] = createSignal<{ markdown: string; filename: string } | null>(null);
  const [previewError, setPreviewError] = createSignal<string | null>(null);
  const [previewing, setPreviewing] = createSignal(false);

  const NOTE_LIMIT = 400;
  const noteLength = createMemo(() => personalNote().trim().length);
  const noteTooLong = createMemo(() => noteLength() > NOTE_LIMIT);

  /**
   * Gender only affects Russian singular address, so it is shown only when it
   * actually changes the wording. Offering it elsewhere would imply a meaning
   * the other languages do not have.
   */
  const genderMatters = createMemo(() => language() === 'ru' && number() === 'singular');

  const canSubmit = createMemo(
    () => guests().trim().length > 0 && !noteTooLong() && !busy(),
  );

  /** The request the preview renders, or null when there is nothing to show. */
  function previewPayload(): GenerationRequest | null {
    if (guests().trim().length === 0 || noteTooLong()) return null;
    return {
      guests: guests().trim(),
      language: language(),
      number: number(),
      register: register(),
      gender: gender(),
      countryCode: countryCode(),
      personalNote: personalNote().trim() || null,
      photoShape: photoShape(),
    };
  }

  /**
   * Live preview.
   *
   * Solid 2 splits an effect into a compute half (what it tracks) and an effect
   * half (what it does). The compute half returns the serialised request, so
   * the effect runs when something the invitation actually says changes — and
   * not when an unrelated signal is written. The cleanup it returns cancels a
   * pending debounce and aborts an in-flight request, so a slower earlier
   * response can never overwrite a newer one.
   *
   * Typing is debounced, so a guest name is rendered once the operator pauses,
   * not once per keystroke.
   *
   * A failure is reported in the preview panel and never blocks the form: the
   * usual cause is a country generation would reject with the same message.
   */
  createEffect(
    () => {
      const payload = previewPayload();
      return payload ? JSON.stringify(payload) : null;
    },
    (key) => {
      if (key === null) {
        setPreview(null);
        setPreviewError(null);
        setPreviewing(false);
        return;
      }

      const payload = JSON.parse(key) as GenerationRequest;
      const controller = new AbortController();

      const timer = setTimeout(() => {
        setPreviewing(true);
        setPreviewError(null);

        void previewInvitation(payload)
          .then((result) => {
            if (controller.signal.aborted) return;
            setPreview(result);
          })
          .catch((err: unknown) => {
            if (controller.signal.aborted) return;
            setPreview(null);
            setPreviewError(
              err instanceof Error ? err.message : 'Could not render the preview',
            );
          })
          .finally(() => {
            if (!controller.signal.aborted) setPreviewing(false);
          });
      }, 250);

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    },
  );

  async function submit(e: Event) {
    e.preventDefault();
    if (!canSubmit()) return;

    setBusy(true);
    setError(null);
    setDone(null);

    const payload: GenerationRequest = {
      guests: guests().trim(),
      language: language(),
      number: number(),
      register: register(),
      gender: gender(),
      countryCode: countryCode(),
      personalNote: personalNote().trim() || null,
      photoShape: photoShape(),
    };

    try {
      await generateInvitation(payload);
      setDone(payload.guests);
      props.onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="generate">
      <form class="card form" onSubmit={submit}>
      <h2>New invitation</h2>

      <Show when={reused()}>
        <p class="muted prefill-note">
          Started from a history entry. Generating saves a new record; the
          original is left as it was.
        </p>
      </Show>

      <label class="field">
        <span class="label">
          Guest name<em>one person or several, exactly as it should appear</em>
        </span>
        <input
          type="text"
          value={guests()}
          placeholder="e.g. Loimie — or — Máté and Szandra"
          maxlength={200}
          required
          onInput={(e) => setGuests(e.currentTarget.value)}
        />
      </label>

      <label class="field">
        <span class="label">Language</span>
        <select
          value={language()}
          onChange={(e) => setLanguage(e.currentTarget.value as Language)}
        >
          <option value="en">{LANGUAGE_LABELS.en}</option>
          <option value="ru">{LANGUAGE_LABELS.ru}</option>
          <option value="ceb">{LANGUAGE_LABELS.ceb}</option>
        </select>
      </label>

      <fieldset class="field">
        <legend class="label">How many people is this for?</legend>
        <div class="choices">
          <label class={{ choice: true, active: number() === 'singular' }}>
            <input
              type="radio"
              name="number"
              checked={number() === 'singular'}
              onChange={() => setNumber('singular')}
            />
            One person
          </label>
          <label class={{ choice: true, active: number() === 'plural' }}>
            <input
              type="radio"
              name="number"
              checked={number() === 'plural'}
              onChange={() => setNumber('plural')}
            />
            Several people
          </label>
        </div>
      </fieldset>

      <fieldset class="field">
        <legend class="label">Tone</legend>
        <div class="choices">
          <label class={{ choice: true, active: register() === 'formal' }}>
            <input
              type="radio"
              name="register"
              checked={register() === 'formal'}
              onChange={() => setRegister('formal')}
            />
            Formal
          </label>
          <label class={{ choice: true, active: register() === 'informal' }}>
            <input
              type="radio"
              name="register"
              checked={register() === 'informal'}
              onChange={() => setRegister('informal')}
            />
            Informal — close friends
          </label>
        </div>
      </fieldset>

      <Show when={genderMatters()}>
        <fieldset class="field">
          <legend class="label">
            Gender<em>Russian address changes with it for one person</em>
          </legend>
          <div class="choices">
            <label class={{ choice: true, active: gender() === 'masculine' }}>
              <input
                type="radio"
                name="gender"
                checked={gender() === 'masculine'}
                onChange={() => setGender('masculine')}
              />
              Masculine
            </label>
            <label class={{ choice: true, active: gender() === 'feminine' }}>
              <input
                type="radio"
                name="gender"
                checked={gender() === 'feminine'}
                onChange={() => setGender('feminine')}
              />
              Feminine
            </label>
          </div>
        </fieldset>
      </Show>

      <div class="field">
        <span class="label">
          Guest's country<em>sets the single time shown on the invitation</em>
        </span>
        <CountryPicker
          countries={props.countries}
          value={countryCode()}
          onChange={setCountryCode}
        />
      </div>

      <label class="field">
        <span class="label">
          Personal note<em>optional — a short line just for them</em>
        </span>
        <textarea
          rows={3}
          value={personalNote()}
          placeholder="e.g. We can't wait to celebrate with you!"
          onInput={(e) => setPersonalNote(e.currentTarget.value)}
        />
        <span class={{ counter: true, over: noteTooLong() }}>
          {noteLength()} / {NOTE_LIMIT}
          <Show when={noteLength() > 0 && noteLength() <= 120}>
            <em> — one or two sentences reads best</em>
          </Show>
        </span>
      </label>

      <fieldset class="field">
        <legend class="label">
          Photo frame<em>the cover photograph — the text preview cannot show it</em>
        </legend>
        <div class="choices">
          <label class={{ choice: true, active: photoShape() === 'arched' }}>
            <input
              type="radio"
              name="photoShape"
              checked={photoShape() === 'arched'}
              onChange={() => setPhotoShape('arched')}
            />
            Arched
          </label>
          <label class={{ choice: true, active: photoShape() === 'rectangular' }}>
            <input
              type="radio"
              name="photoShape"
              checked={photoShape() === 'rectangular'}
              onChange={() => setPhotoShape('rectangular')}
            />
            Rectangular
          </label>
        </div>
      </fieldset>

      <div class="actions">
        <button type="submit" class="primary" disabled={!canSubmit()}>
          {busy() ? 'Generating…' : 'Generate PDF'}
        </button>
        <Show when={done()}>
          <span class="ok">Saved to history: {done()}</span>
        </Show>
      </div>

      <Show when={error()}>
        <p class="error">{error()}</p>
      </Show>
      </form>

      <Preview
        markdown={preview()?.markdown ?? null}
        filename={preview()?.filename ?? null}
        loading={previewing()}
        error={previewError()}
        idle={previewPayload() === null}
      />
    </div>
  );
}

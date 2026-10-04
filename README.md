# Wedding Invitations

A small web app for generating personalised wedding invitations as PDFs, in
English, Russian and Bisaya (Cebuano).

Enter a guest name, pick a language and a tone, choose the guest's country, add
an optional personal line — and download a PDF ready to send. The invitation's
text updates in a live preview as you fill the form, so the wording can be read
before anything is generated. Every generation is kept in a history you can
revisit: an entry can be read as text, built into a PDF again, or loaded back
into the form to amend for another guest.

Oleg & Rose — 13 October 2026, 18:10 EEST (Oleg's time, Romania), online.
Rose is in the Philippines, which is why the ceremony is online.

---

## How it works

```
Browser (SolidJS SPA)
   │  POST /api/preview → markdown only, for reading         (no PDF, no history)
   │  POST /api/generate
   ▼
Fastify server
   │  renderInvitation()  → markdown        (pure, timezone-aware)
   │  md-to-pdf          → HTML → Chromium → PDF
   ▼
PDF bytes → download, and the guest's choices saved to SQLite history
```

The markdown is one rendering of what was said; the PDF is what it looks like.
Neither is stored: history keeps the guest's choices, and both are rebuilt from
them. The stylesheet at `server/src/templates/invitation.css` is used only for
generation and is not shared with the UI.

## The two pages

The invitation is two A5 sheets, and `renderInvitation()` returns them as one
markdown document holding exactly two sections:

- **Page one — the cover.** The invitation's title over the couple's photograph
  in an arched or rectangular frame, the names set in a script face, the date and
  the venue. This section (`<section class="cover cover--rectangular">`) is raw
  HTML, because on this page the layout *is* the content: markdown has no syntax
  for a shaped photograph or stacked script names. It is emitted by
  `server/src/cover.ts`.
- **Page two — the invitation copy.** The greeting, the intro, the optional
  personal note, the time with its two calls to action, and the closing, all
  inside `<section class="details">` on the floral frame as its background. It
  opens straight on the greeting: the cover already carries the title and the
  names, so neither is repeated here.

Both sections are produced by the same `renderInvitation()` call, so a
re-download reproduces the cover from the choices on the record — including the
frame shape it was sent with — rather than from a stored copy of the markdown.

### The photograph's frame

The frame shape is the one generation choice that changes nothing about the
wording — it is a look, not a reading. It is a choice all the same, picked per
guest on the form and carried in the generation input like the language or the
tone, so a record is re-downloaded with the shape it was sent with. The two
shapes are two rules keyed on a class the cover emits, `.cover--arched` and
`.cover--rectangular`, so neither depends on the other being absent.

Because it says nothing, it is also the only field the API will supply for
itself when a request omits it (defaulting to the rectangle). Every other field
would be putting words in the guest's mouth. There is `DEFAULT_PHOTO_SHAPE` in
`server/src/cover.ts`, and the column default for a new database follows it.

The page breaks and the copy live in the markdown; only the appearance lives in
the stylesheet. Page two's copy is one flex column centred in the frame, so a
short invitation sits in the middle of the sheet rather than clinging to the top;
the section has a floor rather than a fixed height, so the centring spends free
space only when there is some. Its blocks are spaced by one uniform flex gap
rather than by per-block margins — margins do not collapse in a flex column, so a
bottom margin would stack with the next block's top margin, and a block that is
not rendered at all would still leave its gap behind. A personal note longer than
the sheet can hold runs onto a plain third sheet rather than being clipped — the
frame is anchored to the top of page two at exactly one page tall, so it never
stretches or distorts.

Both pages are centred flex columns, so their page inset is declared as
`body > section.cover` / `body > section.details` rather than on the classes
alone. That is not a style preference. md-to-pdf bundles a default stylesheet
whose `body > :first-child` and `body > :last-child` rules zero the top padding of
the first section and the bottom padding of the last one — exactly these two
sheets — and at `0,1,1` that reset outranks a plain `.cover` / `.details`
declaration at `0,1,0`. A missing 16mm inset moves a centred column by 8mm, which
reads as copy sitting low on the page. Restating the inset on
`body > section.<class>` (`0,1,2`) outranks it. The same stylesheet's
`body { font-size: 0.6875em }` is the other half of that trap: against our 11pt
root it resolves to 7.56pt, so every block states the size it should read at
rather than inheriting — the intro paragraph shares `--copy-small`, and the
sign-off states the 11pt body size.

### Where the artwork and typefaces live

`server/src/templates/` holds everything the PDF needs beyond the words:

| Path | What it is |
| --- | --- |
| `invitation.css` | the one shared template stylesheet |
| `images/frame.jpg` | page two's background |
| `images/photo.jpg` | the cover photograph |
| `fonts/GreatVibes-Regular.ttf` | script face for Latin names |
| `fonts/MarckScript-Regular.ttf` | script face for Cyrillic names |

The renderer serves this directory over HTTP and points Chromium at it
(`basedir` in `server/src/pdf.ts`), which is why the stylesheet can reference
`images/photo.jpg` by a relative path that works both in development
(`src/templates`) and in the container (`dist/templates`). The two script files
are one CSS family split by `unicode-range`, so "Oleg & Rose" and "Олег и Роуз"
both come out hand-written.

The palette is sampled from the frame, so the cover and the copy always match
the artwork: the cream sheet, gold rules and olive ink in `:root` at the top of
the stylesheet are the frame's own colours. Swapping `images/frame.jpg` means
re-sampling that block.

The web console wears the same palette: `client/src/styles.css` repeats those
six values in its own `:root` and derives its roles from them, and the favicon's
badge and rings use the gold-deep and the paper. Re-sampling the frame means
updating both `:root` blocks, not just the template.

## History

Every generation is saved, and each entry offers three actions:

- **Preview** renders the invitation's text from the entry's stored choices and
  shows it inline, using the same server call — and so the same copy — as the
  generation form's preview. Nothing stored is read back to do it.
- **Download** (`GET /api/history/:id/pdf`) builds the PDF from the stored guest
  choices — name, language, address form, country, note, frame shape — using the
  constants in `server/src/event.ts` as they are now. A corrected Zoom link, a
  changed Facebook URL or a moved date reaches the guest on a re-download. The
  calendar call to action is a constant too, so repointing `calendarLink` at a
  different event reaches a past guest on a re-download.
- **Amend** opens the generation form with that entry's choices already filled
  in, for a near-identical guest. Generating saves a new record and leaves the
  entry it came from untouched. The prefill is consumed by the form and is not
  re-applied on a later visit, so a blank form stays blank.

History stores the generation **input** and nothing else. The input is the
source of truth; the markdown and the PDF are renderings of it, and keeping
either would freeze the wording and the links of the day it was made — then
every route would have to say which rendering it meant. There is no "original"
download for that reason, and no stored markdown for the preview to read.

### There is one schema, and no migrations

`server/src/history.ts` holds the only schema this code can read or write. On
open, the file is compared against it — structurally, through SQLite's own
table and index metadata — and **if it does not match exactly, the file and its
write-ahead log are deleted and a fresh database is created**. A reset is
reported through the app logger at boot.

So changing the schema is the migration: the old file is the wrong shape and is
discarded rather than upgraded. This is a deliberate trade. History is a
convenience, and a migration is a second schema to keep correct for as long as
the file survives — which, on a mounted volume, is forever. The cost is that
**a schema change discards all existing history**, including on a deployed
volume; that is the intended behaviour, not an accident.

This is also what retires the obsolete markdown of earlier formats. Dropping the
`markdown` column made every existing file a mismatch, so the first boot under
this schema discarded those rows before any code could try to render them, and
the template no longer carries a rule for the blockquote a note used to be.

## The text preview

The form shows the invitation's **text contents**, live, before anything is
generated. It exists so the wording can be read and approved rather than
discovered in a PDF — a typo in a guest's name is cheap to fix here.

Two deliberate limits:

- **Text, not layout.** The preview says what the invitation *says*, never what
  it looks like. Typography and layout belong to the PDF's stylesheet, which the
  UI does not share; if you are reviewing spacing, the preview is not the tool.
- **Not a second template.** `POST /api/preview` calls the same
  `renderInvitation()` the PDF path calls. There is no preview-only copy, so the
  preview cannot drift from the artifact — approving text here approves the text
  the guest receives.

`POST /api/preview` is therefore the one endpoint that renders text without
touching a browser or the database: it returns `{ markdown, filename }`, saves
nothing to history, and validates input exactly as generation does. Previewing
is not generating, and a history full of abandoned drafts would bury the
invitations that were actually sent.

The client parses that markdown into readable blocks (`client/src/preview-text.ts`).
It is not a general markdown parser: it handles exactly the constructs the
renderer emits, and anything it does not recognise passes through as literal
text, so copy is never silently hidden. The cover is the one exception on both
counts: it is recognised, and its tags are stripped so the wording inside them —
"Wedding Invitation", the names, the date, the venue — is proofread as text rather
than shown as markup. Links render as their own label, because the calendar
link's URL is a short Google Calendar address, and a raw URL would interrupt the
prose.

A preview carries the same calendar call to action the guest would get: the same
renderer builds it, and it points at Google rather than at this app, so it is
identical whichever host served the preview.

## Requirements

- Node 24+
- A Chromium/Chrome build for PDF rendering
- For non-Latin text in the PDF: fonts covering Cyrillic and Latin
  (`fonts-noto-core`, `fonts-dejavu-core`). The Docker image installs these.
  The cover's script faces do not depend on them: they ship with the app as
  files under `server/src/templates/fonts/`.

## Running locally

```bash
npm install
npm run build     # client + server
npm start         # http://localhost:3000
```

No browser configuration is needed: any Chrome already in Puppeteer's cache (or
a system Chromium) is found automatically.

For development with reload:

```bash
npm run dev          # server on :3000
npm run dev:client   # vite on :5173, proxying /api to :3000
```

### Pointing at a browser

`md-to-pdf` renders through Puppeteer, which by default insists on the **exact**
browser build it was published against. That fails whenever the installed
browser is a different build — puppeteer 25.12.0 wants Chrome 154, so a machine
holding a cached Chrome 148 got `Could not find Chrome` even though a perfectly
good browser was present.

So the browser is located explicitly, most specific first:

1. `PUPPETEER_EXECUTABLE_PATH`, if set (containers use this)
2. the newest build in Puppeteer's cache
3. a system `chromium` / `google-chrome` on `PATH`

If none is found, Puppeteer's own error is surfaced rather than a guess. To
install a matching browser instead, run `npx puppeteer browsers install chrome`
(npm 12 requires opting in via `allow-scripts` in `.npmrc`, already configured).

## Configuration

Everything constant about the wedding lives in **`server/src/event.ts`** — the
single source of truth: date and time, Zoom link, couple names per language, and
their Facebook links. Changing any of these needs a redeploy; there is
deliberately no settings UI, because none of it varies.

Country → timezone mappings live in **`server/src/timezone.ts`**, backed by the
full ISO 3166-1 list in **`server/src/countries.ts`**. Offsets are always
computed from the IANA database at render time, never hardcoded, so a tzdata
update is picked up on redeploy.

**Nothing is configured per deployment.** The invitation holds no link back to
the app it was generated on, so there is no base URL to get right: its two links
are the Zoom call and the calendar call to action, and both are absolute
addresses that exist independently of where the app runs. A PDF has no base URL
of its own — which is exactly why an app-hosted link used to need `Host` and
`X-Forwarded-*` handling. That whole surface went with the link.

### Add to calendar

The call to action opens **the couple's own Google Calendar event**, held as
`calendarLink` in `server/src/event.ts`. It is one event the couple own and
maintain, not a generated template of one: every guest saves the same entry, and
the invitation carries a constant rather than a URL built at render time.

It started as an `.ics` file served by this app, which meant a download, then
leaving the PDF to find the file and choose an app to open it with — and it took
an explainer sentence to justify. The label names Google, and the sentence is
gone. A generated Google template URL was tried between the two and dropped: it
put the event title inside the invitation's link, where the English names leaked
into the Russian copy, and it left one prefilled copy per guest instead of one
event to correct.

**The ceremony time now lives in two places** — `instant`, which the copy and the
`.ics` derive from, and the event itself, which is edited in Google Calendar. This
repository cannot see the second one, so a test suite will never catch them
drifting apart. If the wedding moves, change both.

`GET /api/calendar.ics` still exists for the guest who is not on Gmail — the
couple can hand it over, or attach it to the covering email. Nothing links to it,
so the route has no language to inherit and serves English.

## Timezones

The couple are in **two countries** — Oleg in Romania, Rose in the Philippines —
and the wedding is online for exactly that reason. There is no shared location
and therefore no single "the couple's time"; the invitations do not imply one.

Each invitation shows **exactly one time**: the guest's own, labeled with the
zone it is based on and the offset — for example:

```
## вторник, 13 октября 2026 г. в 18:10 — UTC+3, МСК
## Tuesday, 13 October 2026 at 23:10 — UTC+8, Philippines time
```

Every ISO country is selectable, not just the curated shortlist: a country the
couple never thought about is generated from `countries.ts`, resolved to its
primary zone. Kosovo (not in ISO 3166-1) is carried as a curated entry. The
label follows one rule: a **single-zone** country reads
"<Country> time" in the guest's language ("Germany time", "время Германии"); a
**multi-zone** country is split into one entry per zone and labeled with a
well-known, DST-neutral abbreviation ("ET", "WIB", "AET"), because the numeric
offset beside it would contradict a standard-time abbreviation on a summer date.
The picker itself shows the offset (or that abbreviation) rather than repeating
the country name.

A guest is told which zone **their** time is in and nothing else. A guest in
Moscow sees МСК; Romania is not named to them, and neither is the Philippines,
because naming a country they are not in would only raise a question they do not
need answered. The one exception is a guest who *is* in one of those countries —
then it is their own zone, and they get the same treatment as everyone else.

The ceremony's stated clock time (18:10) is local to Bucharest, which is a
reference point for interpreting that instant — not a "home" that guests are
being invited away from. It never appears in the copy.

The `.ics` file carries the time in UTC, so a guest's calendar app localises it
correctly on its own. The invitation never shows two times: the copy prints the
guest's own zone and the `.ics` stores the same instant. The Google Calendar
event is the couple's own and states its own zone, which is why its time and
`instant` have to be kept in step by hand.

### Why a timezone library

Offsets come from **moment-timezone's** bundled IANA data, not from Node's
`Intl`. Node keeps its timezone data inside ICU, and that snapshot lags the
IANA releases: ICU 78.3 ships tzdata **2026a**, but Morocco moved to permanent
**UTC+0 on 2026-09-20** in release **2026d**. Trusting `Intl` would have told a
guest in Casablanca the wrong hour, and it would have been wrong in only that
one country — the kind of bug that survives a green test suite.

Both the clock face and the offset label are derived from the same source, so
they can never disagree. `tzDataVersion()` reports the bundled IANA release, and
bumping the dependency is all that is needed when IANA publishes again.

Countries spanning multiple zones (United States, Canada, Australia, Indonesia,
Brazil, Mexico, Kazakhstan) are listed per zone with the assumption stated in
the label, so a guest can see which one was chosen; the plain country is not
repeated as a second, silently-defaulted row. A country that resolves to
nothing is rejected rather than silently falling back to the ceremony zone.

For the remaining multi-zone countries (Chile, Spain, New Zealand, the
Galápagos, and similar) only the primary zone is offered, so the list stays a
country list rather than an exhaustive zone list. A guest in the Azores or the
Chathams is therefore the one case this does not handle exactly; add a curated
per-zone entry in `timezone.ts` if that ever matters.

## Languages and address forms

Guest names are a single free string — never parsed. Address is driven by two
explicit selectors, plus gender where it matters:

| Language | Mechanism |
| --- | --- |
| English | No variation — the greeting is just "Dear"; the guest's own name supplies the noun |
| Russian | Number, register **and** gender for singular; plural collapses gender |
| Cebuano | Number only — no grammatical gender. `kamo` is plural *and* the polite singular |

The gender selector appears **only** for Russian singular, where it changes the
wording (`Уважаемый` / `Уважаемая`). Every other combination ignores it, so the
form never implies a distinction the language does not make.

## Testing

```bash
npm test
```

185 tests: the server's 177 across five seams, plus 8 in the client.

- `renderInvitation(input)` — pure markdown generation: languages, timezones,
  filenames, personal note placement
- HTTP API via Fastify `inject()` — validation, status codes, PDF responses
- Text preview — same API surface, but built with **no PDF renderer injected**,
  so a preview that reached for a browser would fail the test
- PDF adapter — Puppeteer is injected, so only one test launches a browser
- History — real SQLite file per test, never mocked, including the reset of a
  file whose schema is not the current one
- Client `filenameFrom` — the `Content-Disposition` contract with the server,
  parsed from a header the server really builds, so a Cyrillic guest name cannot
  silently fall back to an ASCII stand-in on its way to the downloads folder

The one test that launches Chromium is the proof that real PDF bytes come out.

`npm test` typechecks the tests before running them (`tsconfig.test.json`).
The build config only covers `src/`, so without this step a test could pass at
runtime while quietly violating a type — which is exactly how a required
`gender` field went missing from one suite's fixture.

## Deployment

Build and run with Docker:

```bash
docker build -t wedding-invitations .
docker run -p 3000:3000 -v invitations-data:/data wedding-invitations
```

The image is multi-stage: a build stage compiles the client and server, and a
runtime stage carries only production dependencies, Chromium and fonts.

- **History** is stored at `/data/history.sqlite` — mount a volume to keep it
  across redeploys. A redeploy that changes the schema replaces that file rather
  than migrating it (see "There is one schema, and no migrations"), so the
  volume is what makes history survive anything else.
- **Fonts** are installed explicitly. Without them, Cyrillic guest names render
  as boxes in the PDF. The cover's script faces are the exception: they are
  served from `templates/fonts/` with the stylesheet, so they need no package.
- **Chromium** comes from the distro (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`),
  and `PUPPETEER_SKIP_DOWNLOAD` avoids a redundant bundled copy.

On Coolify the app runs the image CI publishes — see below. The only thing the
service needs is a persistent volume at `/data`.

### CI/CD

`.github/workflows/deploy.yml` runs on every pull request and push to `main`:

| Stage | What it does |
| --- | --- |
| `test` | `npm ci`, client typecheck, the full test suite (including the real-Chromium PDF test), full build |
| `build` | on `main` only: builds the image, pushes `ghcr.io/olegedly/marriage-invitations:latest` and `:sha-<commit>`, cached through BuildKit |
| `deploy` | on `main` only: POSTs the Coolify deploy webhook, which pulls `:latest` and restarts |

Two repository secrets drive the deploy (Settings → Secrets and variables →
Actions):

| Secret | Value |
| --- | --- |
| `WEBHOOK_URL` | `https://coolify.olegedly.com/api/v1/deploy?uuid=<resource-uuid>` |
| `WEBHOOK_SECRET` | a Coolify API token (Coolify → Keys & Tokens → API tokens) |

The `uuid` is the Coolify resource's own UUID, visible in its URL in the UI.
Until both secrets exist the `deploy` job fails with a message naming them —
deliberately, so that a missing secret cannot look like a successful deploy.

The endpoint has to answer before it can deploy: `curl -I` the `WEBHOOK_URL` and
a 503 means Coolify's proxy has no route for that host. Reaching the dashboard
on Coolify's raw IP and port is not a substitute for the webhook, because an
`http://` URL would put the API token on the wire in clear text.

### Coolify

1. **New Resource → Docker Compose**, then paste `docker-compose.coolify.yml`.
2. Set the domain to `marry.oleg.date`. Coolify's Traefik edge terminates TLS;
   the service publishes no host port.
3. Add a persistent volume mounted at `/data`, so history survives redeploys.
4. Nothing to configure for the registry: the image is published publicly, and
   `docker manifest inspect ghcr.io/olegedly/marriage-invitations:latest`
   succeeds with no credentials. If it is ever made private (Package settings →
   Change visibility), register a `read:packages` token under Coolify →
   Registry instead.
5. Put the resource UUID in the `WEBHOOK_URL` secret, then push to `main` (or run
   the workflow by hand) to deploy.

Every redeploy pulls `:latest`, so the previous `:sha-<commit>` tag is the
rollback: pin it in the compose file to revert a bad deploy.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATABASE_PATH` | `data/history.sqlite` | SQLite file location |
| `PUPPETEER_EXECUTABLE_PATH` | auto-detected | Force a specific browser binary |

## Layout

```
server/
  src/
    event.ts          ← single source of truth for wedding constants
    countries.ts      ← the full ISO 3166-1 list and each country's primary zone
    timezone.ts       ← curated overrides, country → zone, offset formatting
    render.ts         ← markdown generation (the core)
    cover.ts          ← the cover page, authored as HTML
    calendar.ts       ← the .ics artifact (fallback for non-Gmail guests)
    pdf.ts            ← md-to-pdf adapter (injectable)
    history.ts        ← SQLite history: one schema, replaced when it does not match
    app.ts            ← Fastify routes
    templates/
      invitation.css  ← the one shared template stylesheet
      images/         ← the frame background and the cover photograph
      fonts/          ← the script faces for the couple's names
  test/
client/
  index.html          ← also declares the favicon links
  public/
    favicon.svg       ← the icon; the PNGs beside it are rendered from it
  src/
    App.tsx, api.ts, types.ts
    preview-text.ts   ← markdown → readable text for the preview
    routes/           ← Generate, History
    components/       ← CountryPicker, Preview
```

## Notes for whoever picks this up next

- **The invite time is 18:10 EEST.** Morocco is UTC+0 in October 2026 per
  tzdata 2026d, not UTC+1 as is often assumed — offsets are computed, not
  remembered.
- **Filename slugs keep non-Latin characters** so distinct Cyrillic guests never
  collide. Latin names are de-accented and joined (`Máté and Szandra` →
  `Invitation_MateAndSzandra_EN.pdf`). The header carries the name twice: the
  client reads `filename*` first, so a browser saves
  `Invitation_СемьяИвановых_RU.pdf`; the plain ASCII `filename` fallback
  transliterates (`Invitation_SemyaIvanovykh_RU.pdf`) for anything that cannot
  read `filename*`.
- **Russian copy is grammatically correct but should be proofread** by a native
  speaker, especially the informal forms. Cebuano likewise. The generated
  country labels use a hand-written genitive table (`ru` in `countries.ts`)
  rather than an inflector, so those forms deserve a native speaker's eye too.
- **`client/public/favicon.svg` is the only icon source.** The `.png` files
  beside it are rendered from it — the 32px one as a fallback for browsers that
  cannot use an SVG favicon, the 180px one for iOS home screens (the `.svg`'s
  transparent corners are flattened onto the badge colour first, because iOS
  renders them black otherwise). After editing the SVG, re-render rather than
  redraw:

  ```sh
  rsvg-convert -w 32 -h 32 client/public/favicon.svg -o client/public/favicon-32x32.png
  rsvg-convert -w 180 -h 180 client/public/favicon.svg -o /tmp/touch.png
  magick /tmp/touch.png -background '#8a6b1f' -flatten client/public/apple-touch-icon.png
  ```

  Vite copies `public/` to the build root, so the paths in `index.html` stay
  root-relative and the same files are served by Fastify in production.

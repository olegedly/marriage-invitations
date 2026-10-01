# Wedding Invitations

A small web app for generating personalised wedding invitations as PDFs, in
English, Russian and Bisaya (Cebuano).

Enter a guest name, pick a language and a tone, choose the guest's country, add
an optional personal line — and download a PDF ready to send. Every generation
is kept in a history you can revisit and re-download.

Oleg & Rose — 13 October 2026, 18:10 EEST (Oleg's time, Romania), online.
Rose is in the Philippines, which is why the ceremony is online.

---

## How it works

```
Browser (SolidJS SPA — configuration only, no preview)
   │  POST /api/generate
   ▼
Fastify server
   │  renderInvitation()  → markdown        (pure, timezone-aware)
   │  md-to-pdf          → HTML → Chromium → PDF
   ▼
PDF bytes → download, and a record saved to SQLite history
```

The markdown is the record of what was said; the PDF is what it looks like. The
stylesheet at `server/src/templates/invitation.css` is used only for generation
and is not shared with the UI.

## Requirements

- Node 24+
- A Chromium/Chrome build for PDF rendering
- For non-Latin text in the PDF: fonts covering Cyrillic and Latin
  (`fonts-noto-core`, `fonts-dejavu-core`). The Docker image installs these.

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

Country → timezone mappings live in **`server/src/timezone.ts`**. Offsets are
always computed from the IANA database at render time, never hardcoded, so a
tzdata update is picked up on redeploy.

The base URL for the `.ics` link inside invitations is **derived from the
request** — the origin the browser actually reached the app on — so no
configuration is needed. A PDF has no base URL of its own, so the link must be
absolute; deriving it per request keeps it correct on every host the app is
served from, without a rebuild.

Behind a reverse proxy, `X-Forwarded-Host` and `X-Forwarded-Proto` are honored,
so an internal service name can never leak into a guest-facing link.

`PUBLIC_BASE_URL` overrides this when neither header is trustworthy.

## Timezones

The couple are in **two countries** — Oleg in Romania, Rose in the Philippines —
and the wedding is online for exactly that reason. There is no shared location
and therefore no single "the couple's time"; the invitations do not imply one.

Each invitation shows **exactly one time**: the guest's own, labeled with the
zone it is based on and the offset — for example:

```
## вторник, 13 октября 2026 г. в 18:10 — UTC+3, МСК
## Tuesday, 13 October 2026 at 23:10 — UTC+8, PHT
```

A guest is told which zone **their** time is in and nothing else. A guest in
Moscow sees МСК; Romania is not named to them, and neither is the Philippines,
because naming a country they are not in would only raise a question they do not
need answered. The one exception is a guest who *is* in one of those countries —
then it is their own zone, and they get the same treatment as everyone else.

The ceremony's stated clock time (18:10) is local to Bucharest, which is a
reference point for interpreting that instant — not a "home" that guests are
being invited away from. It never appears in the copy.

The `.ics` file carries the time in UTC, so the guest's calendar app localises
it correctly on its own. That is why the invitation never shows two times.

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
the label, so a guest can see which one was chosen. A country that resolves to
nothing is rejected rather than silently falling back to the ceremony zone.

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

135 tests across four seams:

- `renderInvitation(input)` — pure markdown generation: languages, timezones,
  filenames, personal note placement
- HTTP API via Fastify `inject()` — validation, status codes, PDF responses
- PDF adapter — Puppeteer is injected, so only one test launches a browser
- History — real SQLite file per test, never mocked

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
  across redeploys.
- **Fonts** are installed explicitly. Without them, Cyrillic guest names render
  as boxes in the PDF.
- **Chromium** comes from the distro (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`),
  and `PUPPETEER_SKIP_DOWNLOAD` avoids a redundant bundled copy.

On Coolify, point the service at this repository and mount a persistent volume
at `/data`. CI deploying on push can follow the same pattern as existing
projects.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATABASE_PATH` | `data/history.sqlite` | SQLite file location |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Base URL for the `.ics` link |
| `PUPPETEER_EXECUTABLE_PATH` | auto-detected | Force a specific browser binary |

## Layout

```
server/
  src/
    event.ts          ← single source of truth for wedding constants
    timezone.ts       ← country → zone, offset formatting
    render.ts         ← markdown generation (the core)
    calendar.ts       ← .ics + Google Calendar link
    pdf.ts            ← md-to-pdf adapter (injectable)
    history.ts        ← SQLite history
    app.ts            ← Fastify routes
    templates/
      invitation.css  ← the one shared template stylesheet
  test/
client/
  src/
    App.tsx, api.ts, types.ts
    routes/           ← Generate, History
    components/       ← CountryPicker
```

## Notes for whoever picks this up next

- **The invite time is 18:10 EEST.** Morocco is UTC+0 in October 2026 per
  tzdata 2026d, not UTC+1 as is often assumed — offsets are computed, not
  remembered.
- **Filename slugs keep non-Latin characters** so distinct Cyrillic guests never
  collide. Latin names are de-accented and joined (`Máté and Szandra` →
  `Invitation_MateAndSzandra_EN.pdf`).
- **Russian copy is grammatically correct but should be proofread** by a native
  speaker, especially the informal forms. Cebuano likewise.

/**
 * Seam T2: the Fastify application.
 *
 * Dependencies (history store, PDF renderer, client build directory) are
 * injected so tests never touch a real browser and can use a temp database.
 */

import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIcs, buildGoogleCalendarUrl, icsFilename } from './calendar.js';
import { allCountries, zoneForCountry } from './timezone.js';
import { publicBaseUrl, type EventConstants } from './event.js';
import { renderInvitation, type GenerationInput, type RenderOptions } from './render.js';
import { DEFAULT_PHOTO_SHAPE, type PhotoShape } from './cover.js';
import { generatePdf, type PdfRenderer } from './pdf.js';
import { generationInputOf, type History } from './history.js';
import { contentDisposition } from './download.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  readonly history: History;
  /** Injected so tests avoid launching Chromium. */
  readonly renderPdf?: PdfRenderer;
  /** Directory holding the built SPA. */
  readonly clientDir?: string;
  /**
   * Wedding constants. Defaults to the live EVENT from event.ts; a test passes
   * its own to stand in for a redeploy that changed them, which is exactly the
   * situation the history re-render exists to handle.
   */
  readonly event?: EventConstants;
}

const LANGUAGES = new Set(['en', 'ru', 'ceb']);
const NUMBERS = new Set(['singular', 'plural']);
const REGISTERS = new Set(['formal', 'informal']);
const GENDERS = new Set(['masculine', 'feminine', 'neutral']);
const PHOTO_SHAPES = new Set<PhotoShape>(['arched', 'rectangular']);

interface ValidationOk {
  readonly ok: true;
  readonly value: GenerationInput;
}
interface ValidationErr {
  readonly ok: false;
  readonly message: string;
}

function validate(body: unknown): ValidationOk | ValidationErr {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.guests !== 'string' || b.guests.trim().length === 0) {
    return { ok: false, message: 'Guest name is required' };
  }
  if (b.guests.length > 200) {
    return { ok: false, message: 'Guest name is too long' };
  }
  if (typeof b.language !== 'string' || !LANGUAGES.has(b.language)) {
    return { ok: false, message: 'Unknown language' };
  }
  if (typeof b.number !== 'string' || !NUMBERS.has(b.number)) {
    return { ok: false, message: 'Unknown number form' };
  }
  if (typeof b.register !== 'string' || !REGISTERS.has(b.register)) {
    return { ok: false, message: 'Unknown register' };
  }
  if (typeof b.gender !== 'string' || !GENDERS.has(b.gender)) {
    return { ok: false, message: 'Unknown gender' };
  }
  if (typeof b.countryCode !== 'string') {
    return { ok: false, message: 'Country is required' };
  }

  const country = zoneForCountry(b.countryCode);
  if (!country) {
    return { ok: false, message: 'Unknown country code' };
  }

  let personalNote: string | null = null;
  if (b.personalNote !== null && b.personalNote !== undefined) {
    if (typeof b.personalNote !== 'string') {
      return { ok: false, message: 'Personal note must be text' };
    }
    if (b.personalNote.length > 600) {
      return { ok: false, message: 'Personal note is too long' };
    }
    personalNote = b.personalNote;
  }

  /*
   * The frame shape may be omitted and then takes the default. It is the only
   * choice with a sensible stand-in: every other field changes what the
   * invitation says, and silently choosing a language or a tone on the
   * caller's behalf would put words in the guest's mouth. A browser tab left
   * open across a redeploy is the case this forgives, and a value that IS sent
   * is still checked.
   */
  let photoShape: PhotoShape = DEFAULT_PHOTO_SHAPE;
  if (b.photoShape !== undefined) {
    if (typeof b.photoShape !== 'string' || !PHOTO_SHAPES.has(b.photoShape as PhotoShape)) {
      return { ok: false, message: 'Unknown photo shape' };
    }
    photoShape = b.photoShape as PhotoShape;
  }

  return {
    ok: true,
    value: {
      guests: b.guests.trim(),
      language: b.language as GenerationInput['language'],
      number: b.number as GenerationInput['number'],
      register: b.register as GenerationInput['register'],
      gender: b.gender as GenerationInput['gender'],
      countryCode: b.countryCode,
      personalNote,
      photoShape,
    },
  };
}

/**
 * Origin the caller reached us on, used to build absolute links inside a PDF.
 *
 * A PDF has no base URL, so a relative calendar link would be resolved by the
 * renderer into a dead localhost URL. Deriving the origin from the request
 * means no configuration is needed for the common case.
 *
 * Behind a reverse proxy (Coolify, nginx) the Host header can name an internal
 * address, so X-Forwarded-* wins when present. PUBLIC_BASE_URL still overrides
 * everything for deployments where neither is trustworthy.
 */
function requestOrigin(request: FastifyRequest): string {
  const override = publicBaseUrl();
  if (override) return override;

  const forwardedHost = headerValue(request.headers['x-forwarded-host']);
  const host = forwardedHost ?? headerValue(request.headers.host) ?? 'localhost:3000';

  const forwardedProto = headerValue(request.headers['x-forwarded-proto']);
  const proto = forwardedProto ?? request.protocol ?? 'http';
  const scheme = proto === 'https' ? 'https' : 'http';

  return `${scheme}://${host}`;
}

/** X-Forwarded-* headers may arrive as a list; the first entry is the client's. */
function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' },
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    // Never echo internals such as executable paths back to the client.
    reply.status(500).send({ error: 'Failed to generate the invitation' });
  });

  /**
   * Options every render shares: the caller's own origin, so the calendar link
   * is absolute and correct on whichever host served the request, plus the
   * event constants. In production `deps.event` is unset and the live EVENT is
   * used, so this is not a settings surface — only tests replace it.
   */
  const renderOptions = (request: FastifyRequest): RenderOptions => ({
    baseUrl: requestOrigin(request),
    ...(deps.event ? { event: deps.event } : {}),
  });

  /**
   * Render the invitation's text without producing a PDF.
   *
   * This exists so the wording can be read and approved before a PDF is
   * committed. It is deliberately the same renderInvitation call the PDF path
   * makes, so a preview can never disagree with the artifact it previews — a
   * second template here would mean approving copy the guest never receives.
   *
   * Nothing is written to history: a preview is not a generation, and drafts
   * would bury the invitations that were actually sent.
   */
  app.post('/api/preview', async (request, reply) => {
    const result = validate(request.body);
    if (!result.ok) {
      return reply.status(400).send({ error: result.message });
    }

    try {
      const rendered = renderInvitation(result.value, renderOptions(request));
      return reply.send(rendered);
    } catch (error) {
      return reply
        .status(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid input' });
    }
  });

  app.post('/api/generate', async (request, reply) => {
    const result = validate(request.body);
    if (!result.ok) {
      return reply.status(400).send({ error: result.message });
    }

    let rendered: { markdown: string; filename: string };
    try {
      rendered = renderInvitation(result.value, renderOptions(request));
    } catch (error) {
      // Includes an unknown country, which must never silently fall back.
      return reply
        .status(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid input' });
    }

    const pdf = await generatePdf(rendered.markdown, {
      ...(deps.renderPdf ? { render: deps.renderPdf } : {}),
    });

    deps.history.save({ input: result.value, ...rendered });

    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', contentDisposition(rendered.filename))
      .send(pdf);
  });

  app.get('/api/history', async () => {
    return deps.history.list().map(({ markdown: _markdown, ...rest }) => rest);
  });

  app.get<{ Params: { id: string } }>('/api/history/:id', async (request, reply) => {
    const entry = deps.history.get(request.params.id);
    if (!entry) return reply.status(404).send({ error: 'Not found' });
    return entry;
  });

  app.get<{ Params: { id: string } }>(
    '/api/history/:id/pdf',
    async (request, reply) => {
      const entry = deps.history.get(request.params.id);
      if (!entry) return reply.status(404).send({ error: 'Not found' });

      const pdf = await generatePdf(entry.markdown, {
        ...(deps.renderPdf ? { render: deps.renderPdf } : {}),
      });

      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', contentDisposition(entry.filename))
        .send(pdf);
    },
  );

  /**
   * Re-render a past invitation with the constants in force now.
   *
   * The stored markdown records what was generated, so it keeps the links and
   * wording of that moment even after a redeploy changes them. That is what
   * /pdf above serves. This route deliberately ignores the stored markdown and
   * rebuilds the invitation from the stored guest choices instead, so a
   * corrected Zoom link, Facebook URL or event date reaches the guest on a
   * re-download. The calendar origin comes from the current request, exactly as
   * it does for a fresh generation, rather than the origin captured originally.
   */
  app.get<{ Params: { id: string } }>(
    '/api/history/:id/pdf/current',
    async (request, reply) => {
      const entry = deps.history.get(request.params.id);
      if (!entry) return reply.status(404).send({ error: 'Not found' });

      const rendered = renderInvitation(
        generationInputOf(entry),
        renderOptions(request),
      );

      const pdf = await generatePdf(rendered.markdown, {
        ...(deps.renderPdf ? { render: deps.renderPdf } : {}),
      });

      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', contentDisposition(rendered.filename))
        .send(pdf);
    },
  );

  app.get('/api/countries', async () => {
    return allCountries();
  });

  app.get('/api/calendar.ics', async (_request, reply) => {
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', contentDisposition(icsFilename()))
      .send(buildIcs());
  });

  app.get('/api/calendar/google', async (_request, reply) => {
    return reply.redirect(buildGoogleCalendarUrl());
  });

  // Serve the built SPA when it exists, so one container serves everything.
  const clientDir = deps.clientDir ?? join(HERE, '..', '..', 'client', 'dist');
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

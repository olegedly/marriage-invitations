/**
 * Seam T3: markdown -> PDF, via md-to-pdf (headless Chromium).
 *
 * The renderer is injectable so tests can exercise the pipeline without
 * launching a browser, and so the browser executable can be pointed at a
 * system Chromium in the container.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { discoverBrowser } from './browser.js';

/** Renders markdown plus stylesheet into PDF bytes. */
export type PdfRenderer = (markdown: string, css: string) => Promise<Buffer>;

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, 'templates');
const STYLESHEET = join(TEMPLATES, 'invitation.css');

let cachedCss: string | null = null;

/** The single shared template stylesheet, read once. */
export async function loadStylesheet(): Promise<string> {
  if (cachedCss === null) {
    cachedCss = await readFile(STYLESHEET, 'utf8');
  }
  return cachedCss;
}

/**
 * Default renderer: md-to-pdf, which converts markdown to HTML with marked and
 * then to PDF with headless Chromium.
 *
 * A5 portrait with zero margins, so the stylesheet owns the whole sheet.
 *
 * The browser is located with discoverBrowser rather than left to puppeteer,
 * which matches on the exact build it shipped against and fails whenever the
 * installed browser differs (see src/browser.ts). Rendering works with no
 * configuration at all, which is what `npm start` relies on.
 */
const chromiumRenderer: PdfRenderer = async (markdown, css) => {
  const { mdToPdf } = await import('md-to-pdf');

  const executablePath = discoverBrowser();

  const pdf = await mdToPdf(
    { content: markdown },
    {
      css,
      body_class: ['invitation'],
      /*
       * The images and script fonts the stylesheet and the cover reference are
       * served from here. md-to-pdf serves `basedir` over HTTP and loads the
       * page from it before swapping in the generated HTML, so `images/...` and
       * `fonts/...` resolve against this directory rather than the process's
       * working directory — which is what lets the same relative paths work in
       * development (src/templates) and in the container (dist/templates).
       */
      basedir: TEMPLATES,
      pdf_options: {
        format: 'A5',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      },
      launch_options: {
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        ...(executablePath ? { executablePath } : {}),
      },
    },
  );

  if (!pdf) throw new Error('PDF rendering returned no result');
  return Buffer.from(pdf.content);
};

export interface GeneratePdfOptions {
  readonly render?: PdfRenderer;
}

/** Render invitation markdown into PDF bytes. */
export async function generatePdf(
  markdown: string,
  options: GeneratePdfOptions = {},
): Promise<Buffer> {
  const render = options.render ?? chromiumRenderer;
  const css = await loadStylesheet();

  const pdf = await render(markdown, css);

  if (!pdf || pdf.length === 0) {
    throw new Error('PDF rendering produced empty output');
  }

  return pdf;
}

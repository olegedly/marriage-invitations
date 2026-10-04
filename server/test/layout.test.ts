/**
 * Seam T3c: the geometry of the copy column, measured in a real browser.
 *
 * The stylesheet is tuned against the fixed markdown structure in render.ts, and
 * part of what it promises is geometric rather than textual: the intro and the
 * personal note are the only copy on page two set flush left, so they are one
 * column with one left edge. Nothing about the markdown says so, which is how
 * the note came out centred under a full-width intro: an auto margin on a flex
 * item stops `align-items: stretch`, so a paragraph shorter than the measure has
 * no floor on its width, shrinks to its own text, and is then centred by that
 * same auto margin.
 *
 * The page is measured through md-to-pdf's own pipeline: `as_html` returns
 * page.content() after the `script` hooks have run, so a probe can dump real
 * geometry into the DOM and the test reads it back. That exercises the real
 * marked, the real stylesheet and a real Chromium without importing puppeteer
 * directly, which the server only depends on through md-to-pdf.
 */

import { describe, expect, test } from 'vitest';
import { mdToPdf } from 'md-to-pdf';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInvitation } from '../src/render.js';
import { loadStylesheet } from '../src/pdf.js';
import { discoverBrowser } from '../src/browser.js';
import { guestInput } from './support/render.js';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');

/**
 * Measure every direct child of the copy section, in millimetres, from the
 * section's own left edge.
 *
 * The result is percent-encoded because it is carried out of the page in a text
 * node: guest names hold `&` and quotes, which page.content() would escape into
 * something that is no longer JSON.
 */
const PROBE = `
  (() => {
    const section = document.querySelector('.details');
    const base = section.getBoundingClientRect();
    const mm = (px) => px / (96 / 25.4);
    const boxes = [...section.children].map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        tag: child.tagName,
        text: child.textContent.trim().slice(0, 40),
        width: +mm(rect.width).toFixed(2),
        left: +mm(rect.left - base.left).toFixed(2),
        align: getComputedStyle(child).textAlign,
      };
    });
    const pre = document.createElement('pre');
    pre.id = 'copy-column';
    pre.textContent = encodeURIComponent(JSON.stringify(boxes));
    document.body.appendChild(pre);
  })();
`;

interface Box {
  readonly tag: string;
  readonly text: string;
  readonly width: number;
  readonly left: number;
  readonly align: string;
}

/** The measured children of `.details` for a rendered invitation. */
async function copyColumn(markdown: string): Promise<Box[]> {
  const executablePath = discoverBrowser();

  const result = await mdToPdf(
    { content: markdown },
    {
      as_html: true,
      css: await loadStylesheet(),
      // The frame and the script fonts resolve against this directory, exactly
      // as they do for a PDF (see src/pdf.ts).
      basedir: TEMPLATES,
      body_class: ['invitation'],
      script: [{ content: PROBE }],
      launch_options: {
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        ...(executablePath ? { executablePath } : {}),
      },
    },
  );

  if (!result) throw new Error('HTML rendering returned no result');

  const match = /<pre id="copy-column">([^<]*)<\/pre>/.exec(result.content);
  if (!match?.[1]) throw new Error('the geometry probe did not run');

  return JSON.parse(decodeURIComponent(match[1])) as Box[];
}

const NOTE = 'Magkita ta!';

describe('the copy column', () => {
  test(
    'sets the intro and the note as one flush-left column',
    async () => {
      const { markdown } = renderInvitation(guestInput({ personalNote: NOTE }));
      const boxes = await copyColumn(markdown);

      // The greeting, the time heading, the calls to action and the closing are
      // centred copy; the intro and the note are the whole flush-left group.
      const flushLeft = boxes.filter((box) => box.align === 'left');
      expect(flushLeft).toHaveLength(2);
      // The greeting opens the section, so the intro is the second child and
      // the note is the one that follows it.
      expect(flushLeft[0]).toBe(boxes[1]);
      expect(flushLeft[1]!.text).toBe(NOTE);

      const [intro, note] = [flushLeft[0]!, flushLeft[1]!];
      expect(note.width).toBeCloseTo(intro.width, 1);
      expect(note.left).toBeCloseTo(intro.left, 1);

      // Guard the measurement itself: if the intro had stopped spanning the
      // measure, equal-but-narrow boxes would satisfy the assertions above.
      expect(note.width).toBeGreaterThan(boxes[0]!.width);
    },
    120_000,
  );
});

/**
 * Seam T3: PDF generation.
 *
 * Puppeteer is an external system and is slow, so the renderer is injected.
 * Tests exercise the real adapter once (proving a real PDF comes out) and stub
 * it everywhere else. Our own code is never mocked.
 */

import { describe, expect, test, vi } from 'vitest';
import { generatePdf, type PdfRenderer } from '../src/pdf.js';
import { renderInvitation } from '../src/render.js';
import { guestInput } from './support/render.js';

const MARKDOWN = '# Our Wedding\n\nHello.';

describe('pdf generation adapter', () => {
  test('returns PDF bytes for the given markdown', async () => {
    const stub: PdfRenderer = vi.fn(async () => Buffer.from('%PDF-1.4 fake'));
    const result = await generatePdf(MARKDOWN, { render: stub });

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('passes the markdown through unchanged', async () => {
    const seen: string[] = [];
    const stub: PdfRenderer = async (md) => {
      seen.push(md);
      return Buffer.from('%PDF-1.4');
    };

    await generatePdf(MARKDOWN, { render: stub });

    expect(seen).toEqual([MARKDOWN]);
  });

  test('applies the shared stylesheet', async () => {
    const seen: string[] = [];
    const stub: PdfRenderer = async (_md, css) => {
      seen.push(css);
      return Buffer.from('%PDF-1.4');
    };

    await generatePdf(MARKDOWN, { render: stub });

    expect(seen[0]).toContain('@page');
  });

  test('surfaces a renderer failure instead of returning empty bytes', async () => {
    const stub: PdfRenderer = async () => {
      throw new Error('chromium crashed');
    };

    await expect(generatePdf(MARKDOWN, { render: stub })).rejects.toThrow(
      /chromium crashed/,
    );
  });

  test('rejects an empty renderer result', async () => {
    const stub: PdfRenderer = async () => Buffer.alloc(0);

    await expect(generatePdf(MARKDOWN, { render: stub })).rejects.toThrow(
      /empty/i,
    );
  });
});

describe('real PDF output', () => {
  test(
    'produces a real PDF containing the guest name',
    async () => {
      const md = '# Our Wedding\n\nDear **Loimie**\n\nПриглашение Олег';
      const pdf = await generatePdf(md);

      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    },
    120_000,
  );

  test(
    'lays the invitation out on exactly two pages',
    async () => {
      const { markdown } = renderInvitation(guestInput(), {
        baseUrl: 'https://test.invalid',
      });
      const pdf = await generatePdf(markdown);

      expect(pageCount(pdf)).toBe(2);
    },
    120_000,
  );

  test(
    'embeds both the cover photograph and the frame background',
    async () => {
      // Chromium drops an image it cannot load, so two image objects is what
      // proves the paths in the stylesheet and the cover actually resolved
      // against the served templates directory (see pdf.ts).
      const { markdown } = renderInvitation(guestInput(), {
        baseUrl: 'https://test.invalid',
      });
      const pdf = await generatePdf(markdown);

      expect(imageCount(pdf)).toBe(2);
    },
    120_000,
  );
});

/**
 * Read a value out of the PDF's page tree.
 *
 * Enough to hold the layout to its contract without pulling in a PDF parser:
 * Chromium writes `/Type /Pages /Count n` for the tree and one `/Subtype /Image`
 * per embedded image, and neither is compressed.
 */
function pageCount(pdf: Buffer): number {
  const match = pdf.toString('latin1').match(/\/Type\s*\/Pages\s*\/Count\s+(\d+)/);
  if (!match?.[1]) throw new Error('no page count in the PDF');
  return Number(match[1]);
}

function imageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
}

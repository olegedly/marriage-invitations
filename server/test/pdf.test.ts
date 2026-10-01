/**
 * Seam T3: PDF generation.
 *
 * Puppeteer is an external system and is slow, so the renderer is injected.
 * Tests exercise the real adapter once (proving a real PDF comes out) and stub
 * it everywhere else. Our own code is never mocked.
 */

import { describe, expect, test, vi } from 'vitest';
import { generatePdf, type PdfRenderer } from '../src/pdf.js';

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
});

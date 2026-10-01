import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverBrowser } from '../src/browser.js';

/**
 * Seam T3b: locating a Chromium binary.
 *
 * Puppeteer resolves a browser by the EXACT build it was published against.
 * This machine has Chrome 148.0.7778.167 cached while puppeteer 25.12.0 wants
 * 154.0.8037.57, so `npm start` failed with "Could not find Chrome" even though
 * a perfectly good browser was installed. Tab completion of versions is not
 * something the user should have to do.
 */

/** Build a fake puppeteer cache containing one chrome build. */
function fakeCache(builds: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'pptr-cache-'));
  for (const build of builds) {
    const dir = join(root, 'chrome', build, 'chrome-linux64');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'chrome');
    writeFileSync(exe, '#!/bin/sh\necho fake\n');
    chmodSync(exe, 0o755);
  }
  return root;
}

describe('discoverBrowser', () => {
  test('finds a cached chrome build when the exact version differs', () => {
    const cache = fakeCache(['linux-148.0.7778.167']);
    try {
      const found = discoverBrowser({ cacheDir: cache, env: {} });

      expect(found).toBe(
        join(cache, 'chrome', 'linux-148.0.7778.167', 'chrome-linux64', 'chrome'),
      );
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  test('prefers a newer build when several are cached', () => {
    const cache = fakeCache(['linux-148.0.7778.167', 'linux-154.0.8037.57']);
    try {
      const found = discoverBrowser({ cacheDir: cache, env: {} });

      expect(found).toContain('154.0.8037.57');
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  test('an explicit executable path wins over discovery', () => {
    const cache = fakeCache(['linux-148.0.7778.167']);
    try {
      const found = discoverBrowser({
        cacheDir: cache,
        env: { PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium' },
      });

      expect(found).toBe('/usr/bin/chromium');
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  test('finds a chrome-headless-shell build too', () => {
    const root = mkdtempSync(join(tmpdir(), 'pptr-hs-'));
    try {
      const dir = join(root, 'chrome-headless-shell', 'linux-148.0.7778.167', 'chrome-headless-shell-linux64');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'chrome-headless-shell'), '#!/bin/sh\n');
      chmodSync(join(dir, 'chrome-headless-shell'), 0o755);

      expect(discoverBrowser({ cacheDir: root, env: {} })).toContain('chrome-headless-shell');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('falls back to a system Chromium when the cache is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'pptr-empty-'));
    try {
      const found = discoverBrowser({
        cacheDir: root,
        env: {},
        // Injected so the test does not depend on what this machine has.
        which: (name) => (name === 'chromium' ? '/usr/bin/chromium' : null),
      });

      expect(found).toBe('/usr/bin/chromium');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns undefined when nothing is found, so puppeteer can report it', () => {
    const root = mkdtempSync(join(tmpdir(), 'pptr-none-'));
    try {
      expect(discoverBrowser({ cacheDir: root, env: {}, which: () => null })).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('ignores a cache directory that does not exist', () => {
    expect(
      discoverBrowser({ cacheDir: '/nonexistent/puppeteer-cache', env: {}, which: () => null }),
    ).toBeUndefined();
  });
});

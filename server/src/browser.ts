/**
 * Locating a Chromium binary to render PDFs with.
 *
 * Puppeteer resolves a browser by the EXACT build it was published against.
 * That is fine when the download ran, but it breaks whenever the installed
 * browser is a different build: puppeteer 25.12.0 wants Chrome 154.0.8037.57,
 * while this machine has 148.0.7778.167 cached, so `npm start` failed with
 * "Could not find Chrome" despite a working browser sitting on disk.
 *
 * Discovery order, most explicit first:
 *   1. PUPPETEER_EXECUTABLE_PATH   (operator override; containers set this)
 *   2. newest build in the puppeteer cache
 *   3. a system chromium on PATH
 *
 * Returning undefined lets puppeteer raise its own error, which explains the
 * situation better than a guess would.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

/** Names to look for on PATH, best first. */
const SYSTEM_BINARIES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

/** Candidate executable paths inside a puppeteer cache build directory. */
function executablesIn(buildDir: string, binary: string): string[] {
  return [
    join(buildDir, `${binary}-linux64`, binary),
    join(buildDir, 'chrome-linux64', 'chrome'),
    join(buildDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    join(buildDir, binary),
    join(buildDir, 'chrome'),
  ];
}

/** Sort build directory names so the newest version is last. */
function byVersion(a: string, b: string): number {
  const parts = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  const av = parts(a);
  const bv = parts(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

export interface DiscoverOptions {
  /** Overrides the puppeteer cache location; defaults to the usual one. */
  readonly cacheDir?: string;
  /** Environment to read overrides from. */
  readonly env?: NodeJS.ProcessEnv;
  /** Injected for tests, so system lookup is not machine-dependent. */
  readonly which?: (name: string) => string | null;
}

/** Locate a usable browser, or undefined to let puppeteer report the failure. */
export function discoverBrowser(options: DiscoverOptions = {}): string | undefined {
  const env = options.env ?? process.env;

  const explicit = env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  // Honour an explicit path even if the check is inconclusive (e.g. a bind
  // mount that appears later); puppeteer will give a clearer error than we can.
  if (explicit) return explicit;

  const cacheRoot =
    options.cacheDir ?? env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');

  for (const kind of ['chrome', 'chrome-headless-shell'] as const) {
    const kindDir = join(cacheRoot, kind);
    if (!existsSync(kindDir)) continue;

    let builds: string[];
    try {
      builds = readdirSync(kindDir).filter((name) => {
        try {
          return statSync(join(kindDir, name)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      continue;
    }

    for (const build of builds.sort(byVersion).reverse()) {
      for (const candidate of executablesIn(join(kindDir, build), kind)) {
        try {
          if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
        } catch {
          // Unreadable entry: keep looking rather than failing the request.
        }
      }
    }
  }

  const customWhich = options.which;

  const which =
    customWhich ??
    ((name: string): string | null => {
      try {
        const found = execFileSync('command', ['-v', name], { shell: true, encoding: 'utf8' }).trim();
        return found || null;
      } catch {
        return null;
      }
    });

  for (const name of SYSTEM_BINARIES) {
    const found = which(name);
    if (!found) continue;
    // An injected resolver is trusted as-is; only the real PATH lookup needs
    // the existence check, which its own `command -v` already implies.
    if (customWhich || existsSync(found)) return found;
  }

  return undefined;
}

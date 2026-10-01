import { describe, expect, test } from 'vitest';
import { publicBaseUrl } from '../src/event.js';

/**
 * Seam T1d: the operator override for the base URL.
 *
 * There were two implementations of this: app.ts read PUBLIC_BASE_URL directly
 * while render.ts went through publicBaseUrl(), which also fell back to a
 * hardcoded http://localhost:3000. Two sources for one value can disagree, and
 * the constant was documented as being "used for the .ics link" long after the
 * link started coming from the request instead.
 */

describe('publicBaseUrl', () => {
  test('returns the override when set', () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: 'https://invites.example.org' } as NodeJS.ProcessEnv))
      .toBe('https://invites.example.org');
  });

  test('strips trailing slashes so links never double up', () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: 'https://invites.example.org//' } as NodeJS.ProcessEnv))
      .toBe('https://invites.example.org');
  });

  test('returns undefined when unset, leaving the origin to the request', () => {
    // Undefined is the signal to derive the origin per request. A hardcoded
    // fallback here would silently override a correct request origin.
    expect(publicBaseUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  test('treats an empty override as unset', () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: '' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

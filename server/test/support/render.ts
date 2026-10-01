import { renderInvitation, type GenerationInput } from '../../src/render.js';

/**
 * Test rendering helper.
 *
 * `renderInvitation` requires an explicit `baseUrl` because a PDF has no base
 * URL of its own: a relative calendar link would be resolved by the renderer
 * into a dead localhost address. Production derives that origin from the HTTP
 * request (see requestOrigin in src/app.ts).
 *
 * Tests are not making HTTP requests, so they pass a fixed origin. Only the
 * link's presence matters here, never its host — tests that DO care about the
 * origin assert it explicitly via renderInvitation with their own baseUrl.
 */
export const TEST_BASE_URL = 'https://test.invalid';

export function render(
  input: GenerationInput,
  baseUrl: string = TEST_BASE_URL,
): { markdown: string; filename: string } {
  return renderInvitation(input, { baseUrl });
}

/** The standard guest input used across the render test suites. */
export function guestInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    guests: 'Hanna Bekele',
    language: 'en',
    number: 'singular',
    register: 'formal',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    ...overrides,
  };
}

import { renderInvitation, type GenerationInput } from '../../src/render.js';

/**
 * Test rendering helper.
 *
 * Rendering takes no origin: the invitation's only self-authored link is the
 * calendar call to action, and that points at Google (see src/render.ts). A PDF
 * has no base URL, so a self-referential link would have to be absolute and
 * derived from the request — the whole reason this helper used to thread one.
 */
export function render(input: GenerationInput): { markdown: string; filename: string } {
  return renderInvitation(input);
}

/**
 * The standard guest input used across the render test suites.
 *
 * Each suite used to carry its own copy of this object, which is how one of
 * them quietly lost the required `gender` field: the tests were not
 * typechecked, so nothing caught it. Sharing one definition keeps them
 * honest, and tests are typechecked now (see tsconfig.test.json).
 */
export function guestInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    guests: 'Loimie',
    language: 'en',
    number: 'singular',
    register: 'formal',
    gender: 'neutral',
    countryCode: 'RO',
    personalNote: null,
    photoShape: 'rectangular',
    ...overrides,
  };
}

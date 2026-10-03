import { defineConfig } from 'vitest/config';

/**
 * Client tests stay in a plain Node environment.
 *
 * The only piece of client logic with a contract against the server is
 * filenameFrom, which parses a Content-Disposition header. No DOM is needed,
 * so a test here cannot accidentally come to depend on a browser.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});

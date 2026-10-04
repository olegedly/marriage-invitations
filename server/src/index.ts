import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildApp } from './app.js';
import { openHistory } from './history.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_PATH = process.env.DATABASE_PATH ?? 'data/history.sqlite';

mkdirSync(dirname(DB_PATH), { recursive: true });

/*
 * A database that is not the current schema is replaced on open (see
 * history.ts). That is intended but destructive, so it is reported through the
 * app's own logger rather than happening silently. The reason is collected here
 * because the app that owns that logger does not exist while the store is being
 * opened.
 */
const resets: string[] = [];
const history = openHistory(DB_PATH, { onReset: (reason) => resets.push(reason) });
const app = await buildApp({ history });

for (const reason of resets) {
  app.log.warn(`history: ${reason}`);
}

const close = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  history.close();
  process.exit(0);
};

process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));

await app.listen({ port: PORT, host: HOST });

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildApp } from './app.js';
import { openHistory } from './history.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_PATH = process.env.DATABASE_PATH ?? 'data/history.sqlite';

mkdirSync(dirname(DB_PATH), { recursive: true });

const history = openHistory(DB_PATH);
const app = await buildApp({ history });

const close = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  history.close();
  process.exit(0);
};

process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));

await app.listen({ port: PORT, host: HOST });

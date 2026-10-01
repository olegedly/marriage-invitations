// tsc does not copy non-TS files, so the stylesheet is copied explicitly.
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src', 'templates');
const dest = join(here, '..', 'dist', 'templates');

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);

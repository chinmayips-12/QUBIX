import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDirectory = path.resolve(backendDirectory, '..');

for (const envFile of [
  path.join(projectDirectory, '.env'),
  path.join(backendDirectory, '.env'),
]) {
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
}

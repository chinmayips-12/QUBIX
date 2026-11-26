import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../private-files');
const root = path.resolve(process.env.MEDIREACH_FILE_DIR || defaultRoot);
const types = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export function storeDataUrl(dataUrl, kind) {
  const match = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || '');
  if (!match) throw new Error('Unsupported file format');
  const [, mime, encoded] = match;
  if (kind === 'photo' && !mime.startsWith('image/')) throw new Error('Profile photo must be an image');
  const buffer = Buffer.from(encoded, 'base64');
  const validSignature = mime === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      : mime === 'image/webp' ? buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
        : buffer.toString('ascii', 0, 5) === '%PDF-';
  if (!validSignature) throw new Error('File content does not match its format');
  const limit = kind === 'photo' ? 3 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!buffer.length || buffer.length > limit) throw new Error(`File must be smaller than ${limit / 1024 / 1024} MB`);
  const id = crypto.randomUUID();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, `${id}${types[mime]}`), buffer, { flag: 'wx', mode: 0o600 });
  return { id, mime, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export function readStoredFile(id) {
  if (!/^[\da-f-]{36}$/i.test(id)) return null;
  if (!fs.existsSync(root)) return null;
  const filename = fs.readdirSync(root, { withFileTypes: true })
    .find(entry => entry.isFile() && entry.name.startsWith(`${id}.`))?.name;
  if (!filename) return null;
  const mime = Object.entries(types).find(([, ext]) => filename.endsWith(ext))?.[0];
  if (!mime) return null;
  return { path: path.join(root, filename), mime };
}

export function removeStoredFile(id) {
  const file = readStoredFile(id);
  if (file) fs.unlinkSync(file.path);
}

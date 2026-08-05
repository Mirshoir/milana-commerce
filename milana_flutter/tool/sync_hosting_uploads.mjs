#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, 'true');
  }
}

const catalogFile = args.get('--catalog') || 'firebase/catalog.products.json';
const uploadsDir = args.get('--uploads-dir') || '../Claude Code/milana-premium/data/uploads';
const imageCacheDir = args.get('--image-cache-dir') || 'firebase/image-cache';
const webDir = args.get('--web-dir') || 'build/web';
const outDir = path.join(webDir, 'uploads');
const uploadsSourceUrl = (
  args.get('--uploads-source-url') ||
  process.env.FIREBASE_UPLOADS_SOURCE_URL ||
  'https://milanapremium.uz'
).replace(/\/+$/, '');
const concurrency = positiveInteger(args.get('--concurrency') || '8', '--concurrency', 32);
const timeoutMs = positiveInteger(args.get('--timeout-ms') || '20000', '--timeout-ms', 120000);
const retries = nonNegativeInteger(args.get('--retries') || '2', '--retries', 5);

function positiveInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function nonNegativeInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 0 and ${maximum}.`);
  }
  return parsed;
}

function imageFormat(buffer) {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString('ascii') === 'PNG'
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  ) {
    return 'gif';
  }
  return null;
}

function validateImage(buffer, label, expectedName) {
  if (buffer.length < 1000) {
    throw new Error(`${label} looked too small: ${buffer.length} bytes`);
  }
  const format = imageFormat(buffer);
  if (!format) throw new Error(`${label} is not a recognized raster image.`);

  const extension = path.extname(expectedName).toLowerCase();
  const expectedFormats = {
    '.webp': ['webp'],
    '.png': ['png'],
    '.jpg': ['jpeg'],
    '.jpeg': ['jpeg'],
    '.gif': ['gif'],
  }[extension];
  if (expectedFormats && !expectedFormats.includes(format)) {
    throw new Error(`${label} is ${format}, but its filename ends in ${extension}.`);
  }
  return format;
}

async function readValidImage(file, name) {
  try {
    const buffer = await fs.readFile(file);
    validateImage(buffer, file, name);
    return buffer;
  } catch {
    return null;
  }
}

async function writeAtomically(file, buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, buffer, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function fetchImage(name) {
  const url = new URL(`uploads/${encodeURIComponent(name)}`, `${uploadsSourceUrl}/`);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`returned ${response.status}`);
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        throw new Error(`returned non-image content type ${contentType || '(missing)'}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      validateImage(buffer, url.toString(), name);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url} could not be downloaded: ${lastError?.message || 'unknown error'}`);
}

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
if (!Array.isArray(products)) throw new Error(`${catalogFile} must contain a JSON array.`);

const names = new Set();
for (const product of products) {
  for (const image of product.images || []) {
    const value = String(image);
    const match = value.match(/\/uploads\/([^/?#]+)/);
    if (!match) continue;
    const name = match[1];
    if (
      !name ||
      name === '.' ||
      name === '..' ||
      path.basename(name) !== name ||
      !/^[A-Za-z0-9._-]+$/.test(name)
    ) {
      throw new Error(`Unsafe upload image filename in ${catalogFile}: ${name}`);
    }
    names.add(name);
  }
}

if (names.size === 0) {
  throw new Error(`${catalogFile} does not reference any /uploads catalog images.`);
}

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(imageCacheDir, { recursive: true });

const stats = { required: names.size, local: 0, cached: 0, downloaded: 0 };
const failures = [];
const queue = [...names];
let nextIndex = 0;
let completed = 0;

async function resolveImage(name) {
  const source = path.join(uploadsDir, name);
  const cachedSource = path.join(imageCacheDir, name);
  const target = path.join(outDir, name);

  let buffer = await readValidImage(source, name);
  if (buffer) {
    stats.local += 1;
  } else {
    buffer = await readValidImage(cachedSource, name);
    if (buffer) {
      stats.cached += 1;
    } else {
      buffer = await fetchImage(name);
      await writeAtomically(cachedSource, buffer);
      stats.downloaded += 1;
    }
  }

  await writeAtomically(target, buffer);
}

const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (nextIndex < queue.length) {
    const name = queue[nextIndex];
    nextIndex += 1;
    try {
      await resolveImage(name);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
    completed += 1;
    if (completed % 50 === 0 || completed === queue.length) {
      console.log(`Resolved ${completed}/${queue.length} Firebase Hosting catalog images`);
    }
  }
});
await Promise.all(workers);

if (failures.length > 0) {
  const sample = failures.slice(0, 10).join('\n  - ');
  const remainder = failures.length > 10 ? `\n  - ...and ${failures.length - 10} more` : '';
  throw new Error(
    `Unable to package ${failures.length}/${names.size} required catalog images:\n  - ${sample}${remainder}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  ...stats,
  outDir,
  cacheDir: imageCacheDir,
  sourceUrl: uploadsSourceUrl,
}, null, 2));

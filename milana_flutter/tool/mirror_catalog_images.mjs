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
const outFile = args.get('--out') || 'firebase/catalog.firebase-products.json';
const cacheDir = args.get('--cache-dir') || 'firebase/image-cache';
const uploadsPrefix = args.get('--uploads-prefix') || '/uploads';
const noDownload = args.has('--no-download');
const force = args.has('--force');
const concurrency = Number(args.get('--concurrency') || 8);

function safeFilePart(value) {
  return String(value || 'milana')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'milana';
}

function extensionFromUrl(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
  return '';
}

function extensionFromContentType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('png')) return '.png';
  if (value.includes('webp')) return '.webp';
  if (value.includes('jpeg') || value.includes('jpg')) return '.jpg';
  return '.jpg';
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url, targetBase) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  const ext = path.extname(targetBase) || extensionFromContentType(response.headers.get('content-type'));
  const target = path.extname(targetBase) ? targetBase : `${targetBase}${ext}`;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error(`${url} looked too small: ${buffer.length} bytes`);
  }
  await fs.writeFile(target, buffer);
  return path.basename(target);
}

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
if (!Array.isArray(products)) throw new Error(`${catalogFile} must contain a JSON array.`);

await fs.mkdir(cacheDir, { recursive: true });

const stats = {
  products: products.length,
  remoteImages: 0,
  localImages: 0,
  downloaded: 0,
  cached: 0,
  skippedDownload: 0,
};

const usedNames = new Set();
const mirrored = [];
const downloads = [];

for (const product of products) {
  const copy = { ...product };
  copy.images = [];
  const images = Array.isArray(product.images) ? product.images : [];

  for (let index = 0; index < images.length; index += 1) {
    const value = String(images[index]);
    if (!/^https?:\/\//.test(value)) {
      stats.localImages += 1;
      copy.images.push(value);
      const localName = value.match(/\/uploads\/([^/?#]+)/)?.[1];
      if (localName) usedNames.add(localName);
      continue;
    }

    stats.remoteImages += 1;
    const base = safeFilePart(`${product.slug || product.id}-${index + 1}`);
    const urlExt = extensionFromUrl(value);
    let filename = `${base}${urlExt || '.jpg'}`;
    let suffix = 2;
    while (usedNames.has(filename)) {
      filename = `${base}-${suffix}${urlExt || '.jpg'}`;
      suffix += 1;
    }
    usedNames.add(filename);

    const target = path.join(cacheDir, filename);
    const cached = await exists(target);
    if (!noDownload && (force || !cached)) {
      downloads.push({ url: value, target });
    } else if (cached) {
      stats.cached += 1;
    } else {
      stats.skippedDownload += 1;
    }

    copy.images.push(`${uploadsPrefix}/${filename}`);
  }

  mirrored.push(copy);
}

if (downloads.length > 0) {
  let completed = 0;
  const workers = Array.from({ length: Math.min(concurrency, downloads.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < downloads.length; index += concurrency) {
      const item = downloads[index];
      await downloadImage(item.url, item.target);
      stats.downloaded += 1;
      completed += 1;
      if (completed % 25 === 0 || completed === downloads.length) {
        console.log(`Downloaded ${completed}/${downloads.length} mirrored images`);
      }
    }
  });
  await Promise.all(workers);
}

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(mirrored, null, 2) + '\n');

console.log(JSON.stringify({
  ...stats,
  out: outFile,
  cacheDir,
}, null, 2));

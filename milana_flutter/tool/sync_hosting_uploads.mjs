#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);

const catalogFile = args.get('--catalog') || 'firebase/catalog.products.json';
const uploadsDir = args.get('--uploads-dir') || '../Claude Code/milana-premium/data/uploads';
const imageCacheDir = args.get('--image-cache-dir') || 'firebase/image-cache';
const webDir = args.get('--web-dir') || 'build/web';
const outDir = path.join(webDir, 'uploads');

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
const names = new Set();
for (const product of products) {
  for (const image of product.images || []) {
    const value = String(image);
    const match = value.match(/\/uploads\/([^/?#]+)/);
    if (match) names.add(match[1]);
  }
}

await fs.mkdir(outDir, { recursive: true });
let copied = 0;
for (const name of names) {
  const source = path.join(uploadsDir, name);
  const cachedSource = path.join(imageCacheDir, name);
  const target = path.join(outDir, name);
  try {
    await fs.copyFile(source, target);
    copied++;
  } catch (error) {
    try {
      await fs.copyFile(cachedSource, target);
      copied++;
    } catch {
      console.warn(`Skipped ${name}: ${error.message}`);
    }
  }
}

console.log(`Copied ${copied}/${names.size} upload image files into ${outDir}`);

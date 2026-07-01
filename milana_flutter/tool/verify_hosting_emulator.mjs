#!/usr/bin/env node
import fs from 'node:fs/promises';

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

const baseUrl = (args.get('--url') || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const catalogFile = args.get('--catalog') || 'firebase/catalog.firebase-products.json';

async function check(path, expect = '') {
  const response = await fetch(baseUrl + path);
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const text = new TextDecoder().decode(body.slice(0, Math.min(body.byteLength, 3000)));
  if (expect && !text.includes(expect)) throw new Error(`${path} did not include ${expect}`);
  return body.byteLength;
}

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
const relativeImage = products.flatMap((product) => product.images || []).find((image) => String(image).startsWith('/uploads/'));

const result = {
  indexBytes: await check('/', 'flutter_bootstrap.js'),
  bootstrapBytes: await check('/flutter_bootstrap.js', '_flutter.loader'),
  flutterJsBytes: await check('/flutter.js'),
  imageBytes: relativeImage ? await check(relativeImage) : 0,
  image: relativeImage || null,
};

if (result.flutterJsBytes < 1000) {
  throw new Error(`/flutter.js looked too small: ${result.flutterJsBytes} bytes`);
}

if (relativeImage && result.imageBytes < 1000) {
  throw new Error(`${relativeImage} looked too small: ${result.imageBytes} bytes`);
}

console.log(JSON.stringify(result, null, 2));

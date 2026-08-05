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

function imageFormat(buffer) {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString('ascii') === 'PNG'
  ) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  ) return 'gif';
  return null;
}

async function fetchAsset(assetPath, expect = '') {
  const response = await fetch(baseUrl + assetPath);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${assetPath} returned ${response.status}`);
  const text = buffer.subarray(0, Math.min(buffer.length, 3000)).toString('utf8');
  if (expect && !text.includes(expect)) throw new Error(`${assetPath} did not include ${expect}`);
  return {
    bytes: buffer.length,
    contentType: String(response.headers.get('content-type') || '').toLowerCase(),
    buffer,
  };
}

const products = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
if (!Array.isArray(products)) throw new Error(`${catalogFile} must contain a JSON array.`);
const relativeImage = products
  .flatMap((product) => product.images || [])
  .find((image) => String(image).startsWith('/uploads/'));
if (!relativeImage) {
  throw new Error(`${catalogFile} does not contain a relative /uploads image to verify.`);
}

const index = await fetchAsset('/', 'flutter_bootstrap.js');
const bootstrap = await fetchAsset('/flutter_bootstrap.js', '_flutter.loader');
const flutterJs = await fetchAsset('/flutter.js');
const image = await fetchAsset(relativeImage);

if (flutterJs.bytes < 1000) {
  throw new Error(`/flutter.js looked too small: ${flutterJs.bytes} bytes`);
}
if (!image.contentType.startsWith('image/')) {
  throw new Error(
    `${relativeImage} returned ${image.contentType || '(missing content type)'} instead of an image.`,
  );
}
if (image.bytes < 1000) {
  throw new Error(`${relativeImage} looked too small: ${image.bytes} bytes`);
}
const format = imageFormat(image.buffer);
if (!format) {
  throw new Error(`${relativeImage} did not contain a recognized raster image.`);
}

console.log(JSON.stringify({
  ok: true,
  indexBytes: index.bytes,
  bootstrapBytes: bootstrap.bytes,
  flutterJsBytes: flutterJs.bytes,
  imageBytes: image.bytes,
  imageContentType: image.contentType,
  imageFormat: format,
  image: relativeImage,
}, null, 2));

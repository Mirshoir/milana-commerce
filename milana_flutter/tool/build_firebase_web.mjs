#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

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

const definesFile = args.get('--defines') || 'firebase/flutter-dart-defines.env';
const catalogFile = args.get('--catalog') || 'firebase/catalog.products.json';
const mirroredCatalogFile = args.get('--mirrored-catalog') || 'firebase/catalog.firebase-products.json';
const uploadsDir = args.get('--uploads-dir') || '../Claude Code/milana-premium/data/uploads';
const imageCacheDir = args.get('--image-cache-dir') || 'firebase/image-cache';
const webDir = args.get('--web-dir') || 'build/web';
const uploadsSourceUrl =
  args.get('--uploads-source-url') ||
  process.env.FIREBASE_UPLOADS_SOURCE_URL ||
  'https://milanapremium.uz';
const deploy = args.has('--deploy');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit ${result.status}`);
  }
}

async function dartDefines() {
  const text = await fs.readFile(definesFile, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => `--dart-define=${line}`);
}

const defines = await dartDefines();
run('node', [
  'tool/mirror_catalog_images.mjs',
  '--catalog',
  catalogFile,
  '--out',
  mirroredCatalogFile,
  '--cache-dir',
  imageCacheDir,
]);
run('flutter', ['build', 'web', ...defines]);
run('node', [
  'tool/sync_hosting_uploads.mjs',
  '--catalog',
  mirroredCatalogFile,
  '--uploads-dir',
  uploadsDir,
  '--image-cache-dir',
  imageCacheDir,
  '--web-dir',
  webDir,
  '--uploads-source-url',
  uploadsSourceUrl,
]);

if (deploy) {
  run('firebase', ['deploy', '--only', 'hosting']);
}

console.log(`Firebase web bundle ready in ${webDir}`);

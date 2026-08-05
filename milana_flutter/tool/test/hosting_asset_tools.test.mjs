import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const projectDir = path.resolve(import.meta.dirname, '../..');

function fakeWebp(size = 1400) {
  const buffer = Buffer.alloc(size, 0x42);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(size - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  return buffer;
}

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function runNode(script, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('sync downloads, validates, caches, and packages a missing catalog image', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-hosting-sync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const image = fakeWebp();
  const server = await startServer((request, response) => {
    if (request.url === '/uploads/demo.webp') {
      response.writeHead(200, { 'content-type': 'image/webp' });
      response.end(image);
      return;
    }
    response.writeHead(404).end();
  });
  t.after(server.close);

  const catalog = path.join(root, 'catalog.json');
  const cache = path.join(root, 'cache');
  const web = path.join(root, 'web');
  await fs.writeFile(catalog, JSON.stringify([{ images: ['/uploads/demo.webp'] }]));
  const result = await runNode('tool/sync_hosting_uploads.mjs', [
    '--catalog', catalog,
    '--uploads-dir', path.join(root, 'missing-local'),
    '--image-cache-dir', cache,
    '--web-dir', web,
    '--uploads-source-url', server.url,
    '--retries', '0',
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await fs.readFile(path.join(cache, 'demo.webp')), image);
  assert.deepEqual(await fs.readFile(path.join(web, 'uploads', 'demo.webp')), image);
  assert.match(result.stdout, /"downloaded": 1/);
});

test('sync fails closed when the source serves an HTML fallback', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-hosting-html-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>fallback</title>');
  });
  t.after(server.close);

  const catalog = path.join(root, 'catalog.json');
  await fs.writeFile(catalog, JSON.stringify([{ images: ['/uploads/missing.webp'] }]));
  const result = await runNode('tool/sync_hosting_uploads.mjs', [
    '--catalog', catalog,
    '--uploads-dir', path.join(root, 'local'),
    '--image-cache-dir', path.join(root, 'cache'),
    '--web-dir', path.join(root, 'web'),
    '--uploads-source-url', server.url,
    '--retries', '0',
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /non-image content type text\/html/);
});

test('hosting verification rejects an SPA document masquerading as a product image', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'milana-hosting-verify-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<script src="flutter_bootstrap.js"></script>');
    } else if (request.url === '/flutter_bootstrap.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('_flutter.loader');
    } else if (request.url === '/flutter.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('x'.repeat(1200));
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Flutter app</title>');
    }
  });
  t.after(server.close);

  const catalog = path.join(root, 'catalog.json');
  await fs.writeFile(catalog, JSON.stringify([{ images: ['/uploads/demo.webp'] }]));
  const result = await runNode('tool/verify_hosting_emulator.mjs', [
    '--catalog', catalog,
    '--url', server.url,
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /text\/html instead of an image/);
});

#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const port = Number(process.env.PORT || process.argv[2] || 5180);
const host = process.env.HOST || '127.0.0.1';
const root = resolve(process.cwd(), 'build/web');

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
]);

function filePathFor(url) {
  const parsed = new URL(url, `http://${host}:${port}`);
  const cleanPath = normalize(decodeURIComponent(parsed.pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(root, `.${sep}${cleanPath}`);
  if (!candidate.startsWith(root)) return join(root, 'index.html');
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, 'index.html');
}

createServer((req, res) => {
  const file = filePathFor(req.url || '/');
  const stream = createReadStream(file);
  res.setHeader('content-type', types.get(extname(file)) || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  stream.on('error', () => {
    res.statusCode = 404;
    res.end('Not found');
  });
  stream.pipe(res);
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});

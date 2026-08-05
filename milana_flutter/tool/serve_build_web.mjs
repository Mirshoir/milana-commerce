#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const port = Number(process.env.PORT || process.argv[2] || 5180);
const host = process.env.HOST || '127.0.0.1';
const root = resolve(process.cwd(), 'build/web');
const apiProxyTarget = new URL(
  process.env.API_PROXY_TARGET || 'https://milanapremium.uz',
);

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

function isProxyRequest(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/uploads/');
}

async function proxyRequest(req, res, parsedUrl) {
  const target = new URL(`${parsedUrl.pathname}${parsedUrl.search}`, apiProxyTarget);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length === 0 ? undefined : Buffer.concat(chunks);
  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      accept: req.headers.accept || '*/*',
      ...(req.headers.authorization
        ? { authorization: req.headers.authorization }
        : {}),
      ...(req.headers['content-type']
        ? { 'content-type': req.headers['content-type'] }
        : {}),
    },
    ...(body === undefined || req.method === 'GET' || req.method === 'HEAD'
      ? {}
      : { body }),
  });
  const responseBody = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = upstream.status;
  for (const header of ['content-type', 'cache-control', 'etag', 'last-modified']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.setHeader('content-length', responseBody.length);
  res.end(req.method === 'HEAD' ? undefined : responseBody);
}

createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${host}:${port}`);
  if (isProxyRequest(parsedUrl.pathname)) {
    try {
      await proxyRequest(req, res, parsedUrl);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'local-api-proxy-unavailable' }));
    }
    return;
  }
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
  console.log(`Proxying /api and /uploads to ${apiProxyTarget.origin}`);
});

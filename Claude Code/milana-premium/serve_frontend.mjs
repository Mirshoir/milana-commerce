import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3002);
const backendOrigin = String(process.env.BACKEND_ORIGIN || "http://127.0.0.1:8002").replace(/\/$/, "");

const aliases = new Map([
  ["/", "index.html"],
  ["/shop", "shop.html"],
  ["/product", "product.html"],
  ["/signin", "signin.html"],
  ["/signup", "signin.html"],
  ["/account", "signin.html"],
  ["/checkout", "shop.html"],
  ["/support", "support.html"],
  ["/terms", "terms.html"],
  ["/ordering", "ordering.html"],
]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const compressibleTypes = new Set([
  "text/html",
  "text/javascript",
  "text/css",
  "application/javascript",
  "application/json",
  "image/svg+xml",
]);

function acceptedEncoding(req) {
  const value = String(req.headers["accept-encoding"] || "").toLowerCase();
  if (value.includes("br")) return "br";
  if (value.includes("gzip")) return "gzip";
  return "";
}

function compressBuffer(buffer, req, contentType) {
  const type = String(contentType || "").split(";", 1)[0].toLowerCase();
  const encoding = buffer.length >= 512 && compressibleTypes.has(type) ? acceptedEncoding(req) : "";
  if (!encoding) return { body: buffer, encoding: "" };
  try {
    return {
      body: encoding === "br"
        ? zlib.brotliCompressSync(buffer, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.gzipSync(buffer, { level: 6 }),
      encoding,
    };
  } catch {
    return { body: buffer, encoding: "" };
  }
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const compressed = compressBuffer(raw, res.req || {}, contentType);
  const headers = {
    "Content-Type": contentType,
    "Content-Length": compressed.body.length,
    "Cache-Control": "no-store",
  };
  if (compressed.encoding) {
    headers["Content-Encoding"] = compressed.encoding;
    headers.Vary = "Accept-Encoding";
  }
  res.writeHead(status, headers);
  res.end(compressed.body);
}

function cacheFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (ext === ".html" || ext === ".json" || name === "flutter_service_worker.js") return "no-store";
  if ([".js", ".css", ".woff", ".woff2", ".ttf", ".otf", ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"].includes(ext)) {
    return "public, max-age=604800, stale-while-revalidate=86400";
  }
  return "public, max-age=86400";
}

function resolvePath(urlPath) {
  const pathname = urlPath.endsWith("/") && urlPath !== "/" ? urlPath.slice(0, -1) : urlPath;
  if (aliases.has(pathname)) return path.join(publicRoot, aliases.get(pathname));
  if (/^\/p\/[a-z0-9-]+$/.test(pathname)) return path.join(publicRoot, "product.html");
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  return path.normalize(path.join(publicRoot, rel));
}

async function proxyMapTile(req, res, url) {
  try {
    const upstream = await fetch(`${backendOrigin}${url.pathname}${url.search}`, {
      method: req.method,
      headers: { accept: req.headers.accept || "image/png" },
    });
    const body = req.method === "HEAD" ? null : Buffer.from(await upstream.arrayBuffer());
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "image/png",
      "Cache-Control": upstream.headers.get("cache-control") || "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    };
    if (body) headers["Content-Length"] = body.length;
    res.writeHead(upstream.status, headers);
    res.end(body);
  } catch {
    send(res, 502, "Map tile unavailable");
  }
}

async function proxyBackendDocument(req, res, url) {
  try {
    const upstream = await fetch(`${backendOrigin}${url.pathname}${url.search}`, {
      method: req.method,
      headers: {
        accept: req.headers.accept || "*/*",
        "accept-encoding": "identity",
      },
    });
    const body = req.method === "HEAD" ? null : Buffer.from(await upstream.arrayBuffer());
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
      "Cache-Control": upstream.headers.get("cache-control") || "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const vary = upstream.headers.get("vary");
    if (vary) headers.Vary = vary;
    if (body) headers["Content-Length"] = body.length;
    res.writeHead(upstream.status, headers);
    res.end(body);
  } catch {
    send(res, 502, "Backend unavailable");
  }
}

function sendNotFound(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext && ext !== ".html") return send(res, 404, "Not found");
  fs.readFile(path.join(publicRoot, "404.html"), (err, source) => {
    if (err) return send(res, 404, "Not found");
    send(res, 404, source, "text/html; charset=utf-8");
  });
}

function serveFile(req, res, filePath) {
  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== publicRoot) return send(res, 403, "Forbidden");
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendNotFound(req, res, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const cache = cacheFor(filePath);
    if (req.method === "HEAD") return res.end();
    const contentType = types[ext] || "application/octet-stream";
    if (!compressibleTypes.has(contentType.split(";", 1)[0].toLowerCase())) {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
      });
      return fs.createReadStream(filePath).pipe(res);
    }
    fs.readFile(filePath, (readErr, source) => {
      if (readErr) return send(res, 500, "Unable to read file");
      const compressed = compressBuffer(source, req, contentType);
      const headers = {
        "Content-Type": contentType,
        "Content-Length": compressed.body.length,
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
      };
      if (compressed.encoding) {
        headers["Content-Encoding"] = compressed.encoding;
        headers.Vary = "Accept-Encoding";
      }
      res.writeHead(200, headers);
      res.end(compressed.body);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    return send(res, 400, "Bad request");
  }
  if (/^\/map-tiles\/\d{1,2}\/\d+\/\d+\.png$/.test(url.pathname)) {
    return proxyMapTile(req, res, url);
  }
  if (url.pathname === "/robots.txt"
    || url.pathname === "/sitemap.xml"
    || /^\/p\/[a-z0-9-]+$/.test(url.pathname)) {
    return proxyBackendDocument(req, res, url);
  }
  serveFile(req, res, resolvePath(url.pathname));
});

server.listen(port, host, () => {
  console.log(`Milana website frontend listening on http://${host}:${port}`);
});

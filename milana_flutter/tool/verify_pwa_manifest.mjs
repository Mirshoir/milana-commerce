#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const webDir = 'web';
const manifestPath = path.join(webDir, 'manifest.json');
const indexPath = path.join(webDir, 'index.html');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const indexHtml = await fs.readFile(indexPath, 'utf8');

assert(manifest.name === 'Milana Premium', 'manifest name must be Milana Premium');
assert(manifest.short_name === 'Milana', 'manifest short_name must be Milana');
assert(manifest.id === '/', 'manifest id must be stable');
assert(manifest.start_url, 'manifest start_url is required');
assert(manifest.scope, 'manifest scope is required');
assert(manifest.lang === 'uz', 'manifest lang must be uz');
assert(manifest.display === 'standalone', 'manifest display must be standalone');
assert(
  Array.isArray(manifest.display_override) &&
    manifest.display_override.includes('standalone'),
  'manifest display_override must include standalone',
);
assert(manifest.background_color === '#fffbf3', 'manifest background color mismatch');
assert(manifest.theme_color === '#6b1f34', 'manifest theme color mismatch');
assert(
  Array.isArray(manifest.categories) &&
    ['shopping', 'business', 'lifestyle'].every((category) =>
      manifest.categories.includes(category),
    ),
  'manifest categories must include shopping, business, and lifestyle',
);

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const iconKeys = new Set(icons.map((icon) => `${icon.src}|${icon.sizes}|${icon.purpose || 'any'}`));
for (const key of [
  'icons/Icon-192.png|192x192|any',
  'icons/Icon-512.png|512x512|any',
  'icons/Icon-maskable-192.png|192x192|maskable',
  'icons/Icon-maskable-512.png|512x512|maskable',
]) {
  assert(iconKeys.has(key), `manifest icon missing: ${key}`);
}
for (const icon of icons) {
  const size = await fileSize(path.join(webDir, icon.src));
  assert(size > 1000, `${icon.src} looks too small: ${size} bytes`);
}

const shortcuts = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
const shortcutUrls = new Set(shortcuts.map((shortcut) => shortcut.url));
for (const url of ['/', '/?tab=cart', '/?tab=support', '/?tab=account']) {
  assert(shortcutUrls.has(url), `manifest shortcut missing ${url}`);
}
for (const shortcut of shortcuts) {
  assert(shortcut.name && shortcut.short_name, `shortcut missing name: ${shortcut.url}`);
  assert(
    Array.isArray(shortcut.icons) && shortcut.icons.length > 0,
    `shortcut missing icons: ${shortcut.url}`,
  );
}

for (const snippet of [
  '<meta name="viewport"',
  '<meta name="theme-color" content="#6b1f34">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Milana Premium">',
  '<link rel="manifest" href="manifest.json">',
  '<title>Milana Premium</title>',
]) {
  assert(indexHtml.includes(snippet), `index.html missing ${snippet}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      manifest: manifestPath,
      icons: icons.length,
      shortcuts: shortcuts.length,
    },
    null,
    2,
  ),
);

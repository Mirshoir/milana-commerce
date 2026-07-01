#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);

const api = (args.get('--api') || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const out = args.get('--out') || 'firebase/catalog.products.json';
const imageMode = args.get('--image-mode') || 'relative'; // relative | absolute

function cleanProduct(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    id: String(row.id ?? row.slug),
    slug: String(row.slug ?? row.id),
    name: String(row.name ?? row.model_no ?? 'Milana'),
    model_no: String(row.model_no ?? ''),
    variant: String(row.variant ?? ''),
    gender: String(row.gender ?? 'women'),
    category: String(row.category ?? 'homewear'),
    price: Number(row.price || 0),
    sizes: Array.isArray(row.sizes) ? row.sizes.map(String) : [],
    images: images.map((image) => {
      const value = String(image);
      if (imageMode === 'absolute' && value.startsWith('/')) return api + value;
      if (imageMode === 'relative' && value.startsWith(api)) return value.slice(api.length);
      return value;
    }),
    fabric_uz: String(row.fabric_uz ?? row.fabric ?? ''),
    fabric_ru: String(row.fabric_ru ?? row.fabric ?? ''),
    fabric_en: String(row.fabric_en ?? row.fabric ?? ''),
    desc_uz: String(row.desc_uz ?? row.description ?? ''),
    desc_ru: String(row.desc_ru ?? row.description ?? ''),
    desc_en: String(row.desc_en ?? row.description ?? ''),
    rating: Number(row.rating || 4.8),
    reviews: Number(row.reviews || 0),
    active: row.active !== false && row.active !== 0,
    sort: Number(row.sort || 0),
    updated_at: new Date().toISOString(),
  };
}

const response = await fetch(`${api}/api/products?limit=1000`);
if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
const rows = await response.json();
const products = rows.map(cleanProduct).filter((product) => product.active && product.price > 0);

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(products, null, 2) + '\n');
console.log(`Exported ${products.length} products to ${out}`);

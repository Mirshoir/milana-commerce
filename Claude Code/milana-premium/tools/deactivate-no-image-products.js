#!/usr/bin/env node
"use strict";

const { DatabaseSync } = require("node:sqlite");

const dbPath = process.argv[2] || "/opt/milanaweb/shared/backend-data/milana.db";
const db = new DatabaseSync(dbPath);

const noImageWhere = `
  active=1
  AND (
    images IS NULL
    OR trim(images) = ''
    OR trim(images) = '[]'
    OR trim(images) = '[ ]'
  )
`;

const before = db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c;
const noImageBefore = db.prepare(`SELECT COUNT(*) c FROM products WHERE ${noImageWhere}`).get().c;
const result = db.prepare(`UPDATE products SET active=0 WHERE ${noImageWhere}`).run();
const after = db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c;
const activeWithImages = db.prepare(`
  SELECT COUNT(*) c
  FROM products
  WHERE active=1
    AND images IS NOT NULL
    AND trim(images) NOT IN ('', '[]', '[ ]')
`).get().c;

db.close();

console.log(JSON.stringify({
  ok: true,
  db: dbPath,
  before,
  noImageBefore,
  deactivated: result.changes,
  after,
  activeWithImages,
}, null, 2));

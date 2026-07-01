"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const schemaPath = path.join(ROOT, "postgres", "schema.sql");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    console.error("Example: DATABASE_URL=postgres://milana:milana@127.0.0.1:5432/milana npm run postgres:schema");
    process.exit(1);
  }

  const schema = fs.readFileSync(schemaPath, "utf8");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(schema);
    console.log(JSON.stringify({ ok: true, schema: path.relative(ROOT, schemaPath) }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const script = new URL('../load_test_public_api.mjs', import.meta.url);

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script.pathname, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('load test measures a bounded local catalog page', async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items: [], meta: { total: 0 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await run([
    '--base-url', `http://127.0.0.1:${address.port}`,
    '--requests', '20',
    '--concurrency', '4',
    '--max-p95-ms', '1000',
  ]);

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.requests, 20);
  assert.equal(report.failures, 0);
  assert.equal(report.concurrency, 4);
});

test('load test blocks remote targets unless explicitly authorized', async () => {
  const result = await run(['--base-url', 'https://staging.example.com']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Remote load tests are disabled/);
});

test('load test blocks production independently of remote authorization', async () => {
  const result = await run(
    ['--base-url', 'https://milanapremium.uz'],
    { ALLOW_REMOTE_LOAD_TEST: '1' },
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Production load tests are blocked/);
});

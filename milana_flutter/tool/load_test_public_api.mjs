#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((value / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function assertSafeTarget(target) {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const productionHosts = new Set(['milanapremium.uz', 'www.milanapremium.uz']);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Load-test target must use HTTP or HTTPS');
  }
  if (loopbackHosts.has(target.hostname)) return;
  if (process.env.ALLOW_REMOTE_LOAD_TEST !== '1') {
    throw new Error(
      'Remote load tests are disabled. Use an isolated staging host and set ALLOW_REMOTE_LOAD_TEST=1.',
    );
  }
  if (
    productionHosts.has(target.hostname) &&
    process.env.ALLOW_PRODUCTION_LOAD_TEST !== '1'
  ) {
    throw new Error('Production load tests are blocked by default.');
  }
}

async function main() {
  const rawBaseUrl = option('base-url', process.env.LOAD_TEST_BASE_URL || '');
  if (!rawBaseUrl) {
    throw new Error('Provide --base-url for an isolated local or staging backend');
  }
  const baseUrl = new URL(rawBaseUrl);
  assertSafeTarget(baseUrl);

  const requestCount = positiveInteger('requests', 300);
  const concurrency = Math.min(positiveInteger('concurrency', 12), requestCount);
  const timeoutMs = positiveInteger('timeout-ms', 5000);
  const maxP95Ms = positiveInteger('max-p95-ms', 1000);
  const maxErrorRate = Number(option('max-error-rate', '0.01'));
  if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
    throw new Error('--max-error-rate must be between 0 and 1');
  }
  const path = option(
    'path',
    '/api/products?limit=96&offset=0&meta=1',
  );
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error('--path must stay on the configured target origin');
  }

  let nextRequest = 0;
  let failures = 0;
  let responseBytes = 0;
  const latencies = [];
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const requestNumber = nextRequest;
      nextRequest += 1;
      if (requestNumber >= requestCount) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();
      try {
        const response = await fetch(target, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        const body = await response.arrayBuffer();
        responseBytes += body.byteLength;
        if (!response.ok) failures += 1;
      } catch {
        failures += 1;
      } finally {
        clearTimeout(timeout);
        latencies.push(performance.now() - started);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = performance.now() - startedAt;
  latencies.sort((a, b) => a - b);
  const errorRate = failures / requestCount;
  const result = {
    target: target.toString(),
    requests: requestCount,
    concurrency,
    failures,
    error_rate: Number(errorRate.toFixed(4)),
    requests_per_second: Number((requestCount / (elapsedMs / 1000)).toFixed(2)),
    response_megabytes: Number((responseBytes / 1024 / 1024).toFixed(2)),
    latency_ms: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: Number((latencies.at(-1) || 0).toFixed(1)),
    },
    thresholds: { max_p95_ms: maxP95Ms, max_error_rate: maxErrorRate },
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.latency_ms.p95 > maxP95Ms || errorRate > maxErrorRate) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});

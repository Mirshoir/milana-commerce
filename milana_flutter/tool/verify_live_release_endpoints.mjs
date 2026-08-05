#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDefines } from './verify_production_release.mjs';

const requiredKeys = [
  'API_BASE_URL',
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_URL',
  'ACCOUNT_DELETION_URL',
  'SUPPORT_URL',
];
const legalDocumentKeys = new Set([
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_URL',
  'ACCOUNT_DELETION_URL',
]);
const draftMarkers = [
  /\bdraft\b/i,
  /\bplaceholder\b/i,
  /lorem ipsum/i,
  /coming soon/i,
  /практическ(?:ий|им)\s+черновик/i,
  /\bчерновик\b/i,
  /\bqoralama\b/i,
];

export class LiveEndpointError extends Error {
  constructor(failures, checks = []) {
    super(`Live release endpoint verification failed with ${failures.length} error(s).`);
    this.name = 'LiveEndpointError';
    this.failures = failures;
    this.checks = checks;
  }
}

function publicHttpsUrl(key, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute URL.`);
  }
  if (url.protocol !== 'https:' || !url.hostname) {
    throw new Error(`${key} must use public HTTPS.`);
  }
  return url;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json,text/html;q=0.9,*/*;q=0.5',
        'User-Agent': 'Milana-Mobile-Release-Preflight/1.0',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyLiveReleaseEndpoints({
  root = process.cwd(),
  defines = 'firebase/mobile-dart-defines.env',
  environment = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
} = {}) {
  let source = '';
  try {
    source = await fs.readFile(path.resolve(root, defines), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const missingEnvironmentKeys = requiredKeys.filter(
      (key) => !String(environment[key] || '').trim(),
    );
    if (missingEnvironmentKeys.length) {
      throw new Error(
        `${defines} does not exist and the environment is missing: ` +
          missingEnvironmentKeys.join(', '),
      );
    }
  }
  const values = parseDefines(source, defines);
  const configured = Object.fromEntries(
    requiredKeys.map((key) => [key, environment[key] || values[key] || '']),
  );
  const endpoints = requiredKeys.map((key) => {
    const base = publicHttpsUrl(key, configured[key]);
    return {
      key,
      url:
        key === 'API_BASE_URL'
          ? new URL('/api/products?limit=1', base)
          : base,
      expectsJson: key === 'API_BASE_URL',
    };
  });
  const checks = [];
  const failures = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        endpoint.url,
        timeoutMs,
      );
      const finalUrl = publicHttpsUrl(
        `${endpoint.key} final URL`,
        response.url || endpoint.url.toString(),
      );
      if (!response.ok) {
        throw new Error(`returned HTTP ${response.status}`);
      }
      const body = await response.text();
      if (endpoint.expectsJson) {
        let decoded;
        try {
          decoded = JSON.parse(body);
        } catch {
          throw new Error('did not return valid JSON');
        }
        if (!Array.isArray(decoded) || decoded.length === 0) {
          throw new Error('returned no catalog products');
        }
      } else if (body.trim().length < 80) {
        throw new Error('returned an empty or placeholder document');
      } else if (
        legalDocumentKeys.has(endpoint.key) &&
        draftMarkers.some((marker) => marker.test(body))
      ) {
        throw new Error('contains draft or placeholder legal wording');
      }
      checks.push({
        key: endpoint.key,
        status: response.status,
        finalUrl: finalUrl.toString(),
      });
    } catch (error) {
      failures.push({
        key: endpoint.key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length) throw new LiveEndpointError(failures, checks);
  return { ok: true, checks };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') {
      parsed.json = true;
      continue;
    }
    if (flag !== '--root' && flag !== '--defines' && flag !== '--timeout-ms') {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const timeoutMs = args['timeout-ms'] ? Number(args['timeout-ms']) : undefined;
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1000)) {
      throw new Error('--timeout-ms must be an integer of at least 1000.');
    }
    const report = await verifyLiveReleaseEndpoints({
      root: args.root,
      defines: args.defines,
      timeoutMs,
    });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const check of report.checks) {
        console.log(`✓ ${check.key}: HTTP ${check.status} ${check.finalUrl}`);
      }
      console.log('All production API and policy endpoints are live.');
    }
  } catch (error) {
    if (error instanceof LiveEndpointError) {
      if (args?.json) {
        console.error(
          JSON.stringify(
            { ok: false, checks: error.checks, failures: error.failures },
            null,
            2,
          ),
        );
      } else {
        console.error(error.message);
        for (const failure of error.failures) {
          console.error(`✗ ${failure.key}: ${failure.message}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

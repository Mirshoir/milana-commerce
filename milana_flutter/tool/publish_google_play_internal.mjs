#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { googleAccessToken } from './google_access_token.mjs';

const androidPublisherScope = 'https://www.googleapis.com/auth/androidpublisher';
const expectedPackage = 'uz.milana.milana_flutter';
const requiredConfirmation = 'PUBLISH_PLAY_INTERNAL';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      args.set(argument.slice(0, separator), argument.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(argument, next);
      index += 1;
    } else {
      args.set(argument, 'true');
    }
  }
  return args;
}

async function fileDetails(file, { minimumBytes, zip = false }) {
  const buffer = await fs.readFile(file);
  if (buffer.length < minimumBytes) throw new Error(`${file} is too small (${buffer.length} bytes).`);
  if (zip && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new Error(`${file} is not a ZIP-based artifact.`);
  return {
    path: file,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    buffer,
  };
}

function parsePubspecVersion(text) {
  const match = text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\+([1-9][0-9]*)\s*$/m);
  if (!match) throw new Error('pubspec.yaml has no semantic version plus positive build number.');
  return { versionName: match[1], versionCode: Number(match[2]) };
}

export async function buildGooglePlayInternalPlan({
  root = process.cwd(),
  packageName = expectedPackage,
  versionName,
  versionCode,
  aabPath,
  mappingPath,
  nativeSymbolsPath,
  releaseNotes = {},
} = {}) {
  if (packageName !== expectedPackage) throw new Error(`Package must be ${expectedPackage}.`);
  if (!/^\d+\.\d+\.\d+$/.test(versionName || '')) throw new Error('versionName must be semantic, for example 1.0.0.');
  const numericVersionCode = Number(versionCode);
  if (!Number.isSafeInteger(numericVersionCode) || numericVersionCode < 1 || numericVersionCode > 2_100_000_000) {
    throw new Error('versionCode must be an integer between 1 and 2100000000.');
  }
  const pubspec = parsePubspecVersion(await fs.readFile(path.resolve(root, 'pubspec.yaml'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.resolve(root, 'store/listing-metadata.json'), 'utf8'));
  if (
    versionName !== pubspec.versionName || numericVersionCode !== pubspec.versionCode ||
    versionName !== metadata.release?.versionName || numericVersionCode !== Number(metadata.release?.buildNumber)
  ) {
    throw new Error(
      `Requested ${versionName}+${numericVersionCode} must match pubspec and listing metadata (${pubspec.versionName}+${pubspec.versionCode}).`,
    );
  }
  const localizedNotes = Object.entries(releaseNotes)
    .map(([language, text]) => ({ language, text: String(text || '').trim() }))
    .filter(({ text }) => text);
  if (!localizedNotes.some(({ language }) => language === 'en-US')) throw new Error('English (en-US) release notes are required.');
  for (const note of localizedNotes) {
    if (!supportedNoteLocale(note.language) || Array.from(note.text).length > 500) {
      throw new Error(`Release notes for ${note.language} are unsupported or exceed 500 characters.`);
    }
  }

  const [aab, mapping, nativeSymbols] = await Promise.all([
    fileDetails(path.resolve(root, aabPath), { minimumBytes: 1024, zip: true }),
    fileDetails(path.resolve(root, mappingPath), { minimumBytes: 20 }),
    fileDetails(path.resolve(root, nativeSymbolsPath), { minimumBytes: 100, zip: true }),
  ]);
  const redactBuffer = ({ buffer: _buffer, ...details }) => details;
  return {
    packageName,
    track: 'internal',
    versionName,
    versionCode: numericVersionCode,
    releaseNotes: localizedNotes,
    artifacts: {
      aab: redactBuffer(aab),
      mapping: redactBuffer(mapping),
      nativeSymbols: redactBuffer(nativeSymbols),
    },
    _buffers: { aab: aab.buffer, mapping: mapping.buffer, nativeSymbols: nativeSymbols.buffer },
    operations: [
      'insert-edit',
      'upload-aab',
      'upload-proguard-mapping',
      'upload-native-symbols',
      'update-internal-track',
      'validate-edit',
      'commit-edit',
    ],
  };
}

function supportedNoteLocale(locale) {
  return ['en-US', 'ru-RU'].includes(locale);
}

function publicPlan(plan) {
  const { _buffers: _ignored, ...result } = plan;
  return result;
}

async function requestJson(fetchImpl, accessToken, url, {
  method,
  body,
  contentType = 'application/json',
  timeoutMs = 120_000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'content-type': contentType }),
      },
      body:
        body === undefined ? undefined :
        contentType === 'application/json' ? JSON.stringify(body) : body,
      signal: controller.signal,
    });
    const text = await response.text();
    let decoded = {};
    if (text) {
      try {
        decoded = JSON.parse(text);
      } catch {
        decoded = { raw: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const message = decoded.error?.message || decoded.message || decoded.raw || response.statusText;
      throw new Error(`${method} ${new URL(url).pathname} returned ${response.status}: ${message}`);
    }
    return decoded;
  } finally {
    clearTimeout(timer);
  }
}

export async function publishGooglePlayInternal(plan, {
  commit = false,
  confirmation = '',
  accessToken = '',
  fetchImpl = fetch,
} = {}) {
  if (!commit) return { ok: true, mode: 'plan', plan: publicPlan(plan) };
  if (confirmation !== requiredConfirmation) {
    throw new Error(`A real upload requires --confirmation=${requiredConfirmation}.`);
  }
  if (!accessToken) throw new Error('A Google Play Android Publisher access token is required.');

  const encodedPackage = encodeURIComponent(plan.packageName);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/edits`;
  const uploadBase = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodedPackage}/edits`;
  let editId = null;
  let committed = false;
  try {
    const edit = await requestJson(fetchImpl, accessToken, base, { method: 'POST', body: {} });
    editId = String(edit.id || '');
    if (!editId) throw new Error('Google Play did not return an edit ID.');
    const encodedEdit = encodeURIComponent(editId);
    const bundle = await requestJson(
      fetchImpl,
      accessToken,
      `${uploadBase}/${encodedEdit}/bundles?uploadType=media`,
      { method: 'POST', body: plan._buffers.aab, contentType: 'application/octet-stream' },
    );
    if (Number(bundle.versionCode) !== plan.versionCode) {
      throw new Error(`Uploaded bundle versionCode ${bundle.versionCode} does not match ${plan.versionCode}.`);
    }
    for (const [type, buffer] of [
      ['proguard', plan._buffers.mapping],
      ['nativeCode', plan._buffers.nativeSymbols],
    ]) {
      await requestJson(
        fetchImpl,
        accessToken,
        `${uploadBase}/${encodedEdit}/apks/${plan.versionCode}/deobfuscationFiles/${type}?uploadType=media`,
        { method: 'POST', body: buffer, contentType: 'application/octet-stream' },
      );
    }
    await requestJson(
      fetchImpl,
      accessToken,
      `${base}/${encodedEdit}/tracks/internal`,
      {
        method: 'PUT',
        body: {
          track: 'internal',
          releases: [{
            name: `${plan.versionName} (${plan.versionCode})`,
            versionCodes: [String(plan.versionCode)],
            releaseNotes: plan.releaseNotes,
            status: 'completed',
          }],
        },
      },
    );
    await requestJson(fetchImpl, accessToken, `${base}/${encodedEdit}:validate`, { method: 'POST' });
    await requestJson(
      fetchImpl,
      accessToken,
      `${base}/${encodedEdit}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
      { method: 'POST' },
    );
    committed = true;
    return {
      ok: true,
      mode: 'committed',
      packageName: plan.packageName,
      track: plan.track,
      versionName: plan.versionName,
      versionCode: plan.versionCode,
      editId,
      artifactSha256: plan.artifacts.aab.sha256,
    };
  } finally {
    if (editId && !committed) {
      try {
        await requestJson(fetchImpl, accessToken, `${base}/${encodeURIComponent(editId)}`, { method: 'DELETE', timeoutMs: 30_000 });
      } catch {
        // Preserve the original error; uncommitted edits expire automatically.
      }
    }
  }
}

async function readReleaseNotes(root, args) {
  const result = {};
  for (const [locale, flag] of [['en-US', '--release-notes-en'], ['ru-RU', '--release-notes-ru']]) {
    const file = args.get(flag);
    if (file) result[locale] = await fs.readFile(path.resolve(root, file), 'utf8');
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get('--root') || process.cwd());
  const plan = await buildGooglePlayInternalPlan({
    root,
    packageName: args.get('--package') || expectedPackage,
    versionName: args.get('--version-name'),
    versionCode: args.get('--version-code'),
    aabPath: args.get('--aab'),
    mappingPath: args.get('--mapping'),
    nativeSymbolsPath: args.get('--native-symbols'),
    releaseNotes: await readReleaseNotes(root, args),
  });
  const commit = args.has('--commit');
  let accessToken = '';
  if (commit) {
    if (process.env.GOOGLE_PLAY_ACCESS_TOKEN) args.set('--access-token', process.env.GOOGLE_PLAY_ACCESS_TOKEN);
    accessToken = await googleAccessToken(args, androidPublisherScope);
  }
  const result = await publishGooglePlayInternal(plan, {
    commit,
    confirmation: args.get('--confirmation') || '',
    accessToken,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

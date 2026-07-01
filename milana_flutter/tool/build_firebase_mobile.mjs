#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, 'true');
  }
}

const definesFile = args.get('--defines') || 'firebase/mobile-dart-defines.env';
const platform = args.get('--platform') || 'android';
const mode = args.get('--mode') || 'release';
const artifact = args.get('--artifact') || 'apk';
const noCodesign = args.has('--no-codesign');
const dryRun = args.has('--dry-run');

function run(command, commandArgs) {
  if (dryRun) {
    console.log([command, ...commandArgs].join(' '));
    return;
  }
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit ${result.status}`);
  }
}

async function dartDefines() {
  const text = await fs.readFile(definesFile, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => `--dart-define=${line}`);
}

const defines = await dartDefines();
const buildMode = mode === 'debug' ? '--debug' : mode === 'profile' ? '--profile' : '--release';

if (platform === 'android') {
  const target = artifact === 'appbundle' ? 'appbundle' : 'apk';
  run('flutter', ['build', target, buildMode, ...defines]);
} else if (platform === 'ios') {
  const iosArgs = ['build', 'ios', buildMode, ...defines];
  if (noCodesign) iosArgs.push('--no-codesign');
  run('flutter', iosArgs);
} else {
  throw new Error(`Unsupported platform "${platform}". Use android or ios.`);
}

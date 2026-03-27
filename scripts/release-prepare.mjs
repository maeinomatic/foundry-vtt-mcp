#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { normalizeVersionInput, readVersionState, versionPattern } from './version-helpers.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionArg = args.find(arg => !arg.startsWith('--'));

if (!versionArg) {
  console.error('Usage: npm run release:prepare -- <version> [--dry-run]');
  process.exit(1);
}

const targetVersion = normalizeVersionInput(versionArg);
if (!versionPattern.test(targetVersion)) {
  console.error(`Invalid version: ${versionArg}`);
  console.error('Expected format: 1.2.3 or 1.2.3-rc.1');
  process.exit(1);
}

const currentVersion = readVersionState().root;

if (dryRun) {
  console.log(`[dry-run] Would update root package version from ${currentVersion} to ${targetVersion}`);
  console.log('[dry-run] Would sync workspace and module manifest versions');
  console.log('[dry-run] Would refresh package-lock.json metadata');
  console.log('[dry-run] Would run npm run version:check');
  process.exit(0);
}

if (targetVersion === currentVersion) {
  console.error(`Version is already ${targetVersion}`);
  console.error('Choose a new version or use --dry-run to inspect the workflow.');
  process.exit(1);
}

const commands = [
  ['npm', ['version', targetVersion, '--no-git-tag-version']],
  ['node', ['scripts/sync-versions.mjs']],
  ['npm', ['install', '--package-lock-only', '--workspaces', '--include-workspace-root']],
  ['node', ['scripts/verify-versions.mjs']]
];

for (const [command, commandArgs] of commands) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Release metadata prepared for ${targetVersion}.`);
console.log('Next steps: review changes, commit them, then run npm run release:tag.');

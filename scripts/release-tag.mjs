#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readVersionState } from './version-helpers.mjs';

const dryRun = process.argv.slice(2).includes('--dry-run');
const version = readVersionState().root;
const tagName = `v${version}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return options.capture ? result.stdout.trim() : '';
}

run('node', ['scripts/verify-versions.mjs']);

const statusOutput = run('git', ['status', '--porcelain'], { capture: true });
if (statusOutput.length > 0) {
  console.error('Working tree is not clean. Commit or stash changes before tagging.');
  process.exit(1);
}

const localTagOutput = run('git', ['tag', '--list', tagName], { capture: true });
if (localTagOutput === tagName) {
  console.error(`Tag ${tagName} already exists locally.`);
  process.exit(1);
}

if (dryRun) {
  console.log(`[dry-run] Would create annotated tag ${tagName} at HEAD.`);
  console.log(`[dry-run] Next push commands: git push origin master && git push origin ${tagName}`);
  process.exit(0);
}

run('git', ['tag', '-a', tagName, '-m', tagName]);

console.log(`Created tag ${tagName}.`);
console.log(`Next push commands: git push origin master && git push origin ${tagName}`);

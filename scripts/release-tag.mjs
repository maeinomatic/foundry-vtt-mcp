#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readVersionState } from './version-helpers.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pushAfterTag = args.includes('--push');
const version = readVersionState().root;
const tagName = `v${version}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
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

const currentBranch = run('git', ['branch', '--show-current'], { capture: true });
if (!currentBranch) {
  console.error('Cannot determine current branch. Check out the release branch before tagging.');
  process.exit(1);
}

const remoteName = 'origin';

if (dryRun) {
  console.log(`[dry-run] Would create annotated tag ${tagName} at HEAD.`);
  if (pushAfterTag) {
    console.log(
      `[dry-run] Would push ${currentBranch} and annotated tag ${tagName} with: git push ${remoteName} ${currentBranch} --follow-tags`
    );
  } else {
    console.log(
      `[dry-run] Next push commands: git push ${remoteName} ${currentBranch} && git push ${remoteName} ${tagName}`
    );
  }
  process.exit(0);
}

run('git', ['tag', '-a', tagName, '-m', tagName]);

console.log(`Created tag ${tagName}.`);

if (pushAfterTag) {
  run('git', ['push', remoteName, currentBranch, '--follow-tags']);
  console.log(`Pushed ${currentBranch} and ${tagName} to ${remoteName}.`);
  console.log('The release workflow should now trigger from the remote tag push.');
} else {
  console.log(
    `Next push commands: git push ${remoteName} ${currentBranch} && git push ${remoteName} ${tagName}`
  );
  console.log('Use npm run release:publish to create and push the release tag in one step.');
}

#!/usr/bin/env node

import { assertVersionLike, normalizeVersionInput, readVersionState } from './version-helpers.mjs';

const versions = readVersionState();

try {
  for (const [name, version] of Object.entries(versions)) {
    if (!version) {
      throw new Error(`Missing ${name} version in release metadata`);
    }

    assertVersionLike(name, version);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const expected = versions.root;
const mismatches = Object.entries({
  'packages/mcp-server/package.json': versions.server,
  'packages/foundry-module/package.json': versions.modulePackage,
  'packages/foundry-module/module.json': versions.moduleManifest,
  'shared/package.json': versions.shared,
  'package-lock.json': versions.packageLock,
  'package-lock.json packages[""]': versions.packageLockRoot,
  'package-lock.json packages["packages/mcp-server"]': versions.packageLockServer,
  'package-lock.json packages["packages/foundry-module"]': versions.packageLockModule,
  'package-lock.json packages["shared"]': versions.packageLockShared
}).filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error('Version mismatch detected:');
  console.error(`- root package.json: ${expected}`);
  for (const [label, version] of mismatches) {
    console.error(`- ${label}: ${version}`);
  }
  console.error('Run: npm run release:prepare -- <version>');
  process.exit(1);
}

const refType = process.env.GITHUB_REF_TYPE || '';
const refName = process.env.GITHUB_REF_NAME || '';
if (refType === 'tag' && refName) {
  const tagVersion = normalizeVersionInput(refName);
  if (tagVersion !== expected) {
    console.error(`Tag/version mismatch: tag ${refName} does not match package version ${expected}`);
    process.exit(1);
  }
}

console.log(`Version check passed (${expected})`);

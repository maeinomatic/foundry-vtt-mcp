#!/usr/bin/env node

import { assertVersionLike, normalizeVersionInput, readVersionState } from './version-helpers.mjs';

/**
 * @typedef {object} VersionState
 * @property {string | undefined} root
 * @property {string | undefined} server
 * @property {string | undefined} modulePackage
 * @property {string | undefined} moduleManifest
 * @property {string | undefined} shared
 * @property {string | undefined} packageLock
 * @property {string | undefined} packageLockRoot
 * @property {string | undefined} packageLockServer
 * @property {string | undefined} packageLockModule
 * @property {string | undefined} packageLockShared
 */

/** @type {VersionState} */
const versions = /** @type {VersionState} */ (readVersionState());

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
/** @type {Record<string, string | undefined>} */
const versionTargets = {
  'packages/mcp-server/package.json': versions.server,
  'packages/foundry-module/package.json': versions.modulePackage,
  'packages/foundry-module/module.json': versions.moduleManifest,
  'shared/package.json': versions.shared,
  'package-lock.json': versions.packageLock,
  'package-lock.json packages[""]': versions.packageLockRoot,
  'package-lock.json packages["packages/mcp-server"]': versions.packageLockServer,
  'package-lock.json packages["packages/foundry-module"]': versions.packageLockModule,
  'package-lock.json packages["shared"]': versions.packageLockShared,
};
const mismatches = Object.entries(versionTargets).filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error('Version mismatch detected:');
  console.error(`- root package.json: ${expected}`);
  for (const [label, version] of mismatches) {
    console.error(`- ${label}: ${version}`);
  }
  console.error('Run: npm run release:prepare -- <version>');
  process.exit(1);
}

const refType = process.env.GITHUB_REF_TYPE ?? '';
const refName = process.env.GITHUB_REF_NAME ?? '';
if (refType === 'tag' && refName) {
  if (normalizeVersionInput(refName) !== expected) {
    console.error(
      `Tag/version mismatch: tag ${refName} does not match package version ${expected}`
    );
    process.exit(1);
  }
}

process.stdout.write(`Version check passed (${expected})\n`);

#!/usr/bin/env node

import { assertVersionLike, readJson, versionFiles, writeJson } from './version-helpers.mjs';

/**
 * @typedef {object} VersionedJsonFile
 * @property {string | undefined} version
 */

/** @type {VersionedJsonFile} */
const rootPackage = /** @type {VersionedJsonFile} */ (readJson(versionFiles.rootPackage));
const targetVersion = rootPackage.version;

try {
  assertVersionLike('root package', targetVersion);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

/** @type {VersionedJsonFile} */
const serverPackage = /** @type {VersionedJsonFile} */ (readJson(versionFiles.serverPackage));
/** @type {VersionedJsonFile} */
const modulePackage = /** @type {VersionedJsonFile} */ (readJson(versionFiles.modulePackage));
/** @type {VersionedJsonFile} */
const moduleManifest = /** @type {VersionedJsonFile} */ (readJson(versionFiles.moduleManifest));
/** @type {VersionedJsonFile} */
const sharedPackage = /** @type {VersionedJsonFile} */ (readJson(versionFiles.sharedPackage));

const changes = [];

if (serverPackage.version !== targetVersion) {
  serverPackage.version = targetVersion;
  writeJson(versionFiles.serverPackage, serverPackage);
  changes.push(`Updated packages/mcp-server/package.json to ${targetVersion}`);
}

if (modulePackage.version !== targetVersion) {
  modulePackage.version = targetVersion;
  writeJson(versionFiles.modulePackage, modulePackage);
  changes.push(`Updated packages/foundry-module/package.json to ${targetVersion}`);
}

if (moduleManifest.version !== targetVersion) {
  moduleManifest.version = targetVersion;
  writeJson(versionFiles.moduleManifest, moduleManifest);
  changes.push(`Updated packages/foundry-module/module.json to ${targetVersion}`);
}

if (sharedPackage.version !== targetVersion) {
  sharedPackage.version = targetVersion;
  writeJson(versionFiles.sharedPackage, sharedPackage);
  changes.push(`Updated shared/package.json to ${targetVersion}`);
}

if (changes.length === 0) {
  process.stdout.write(`Versions already in sync at ${targetVersion}\n`);
} else {
  process.stdout.write(`Synchronized versions to ${targetVersion}\n`);
  for (const change of changes) {
    process.stdout.write(`- ${change}\n`);
  }
}

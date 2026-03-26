#!/usr/bin/env node

import { assertVersionLike, readJson, versionFiles, writeJson } from './version-helpers.mjs';

const rootPackage = readJson(versionFiles.rootPackage);
const targetVersion = rootPackage.version;

try {
  assertVersionLike('root package', targetVersion);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const serverPackage = readJson(versionFiles.serverPackage);
const modulePackage = readJson(versionFiles.modulePackage);
const moduleManifest = readJson(versionFiles.moduleManifest);
const sharedPackage = readJson(versionFiles.sharedPackage);

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
  console.log(`Versions already in sync at ${targetVersion}`);
} else {
  console.log(`Synchronized versions to ${targetVersion}`);
  for (const change of changes) {
    console.log(`- ${change}`);
  }
}

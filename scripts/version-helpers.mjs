#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

export const root = process.cwd();

export const versionPattern = /^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/;

export const versionFiles = {
  rootPackage: path.join(root, 'package.json'),
  packageLock: path.join(root, 'package-lock.json'),
  serverPackage: path.join(root, 'packages', 'mcp-server', 'package.json'),
  modulePackage: path.join(root, 'packages', 'foundry-module', 'package.json'),
  moduleManifest: path.join(root, 'packages', 'foundry-module', 'module.json'),
  sharedPackage: path.join(root, 'shared', 'package.json')
};

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function normalizeVersionInput(version) {
  return version.startsWith('v') ? version.slice(1) : version;
}

export function assertVersionLike(label, version) {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid ${label} version: ${version}`);
  }
}

export function readVersionState() {
  const rootPackage = readJson(versionFiles.rootPackage);
  const packageLock = readJson(versionFiles.packageLock);
  const serverPackage = readJson(versionFiles.serverPackage);
  const modulePackage = readJson(versionFiles.modulePackage);
  const moduleManifest = readJson(versionFiles.moduleManifest);
  const sharedPackage = readJson(versionFiles.sharedPackage);

  return {
    root: rootPackage.version,
    server: serverPackage.version,
    modulePackage: modulePackage.version,
    moduleManifest: moduleManifest.version,
    shared: sharedPackage.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.['']?.version,
    packageLockServer: packageLock.packages?.['packages/mcp-server']?.version,
    packageLockModule: packageLock.packages?.['packages/foundry-module']?.version,
    packageLockShared: packageLock.packages?.shared?.version
  };
}

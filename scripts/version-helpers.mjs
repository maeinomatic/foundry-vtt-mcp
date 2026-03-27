#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

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

export const root = process.cwd();

export const versionPattern = /^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/;

export const versionFiles = {
  rootPackage: path.join(root, 'package.json'),
  packageLock: path.join(root, 'package-lock.json'),
  serverPackage: path.join(root, 'packages', 'mcp-server', 'package.json'),
  modulePackage: path.join(root, 'packages', 'foundry-module', 'package.json'),
  moduleManifest: path.join(root, 'packages', 'foundry-module', 'module.json'),
  sharedPackage: path.join(root, 'shared', 'package.json'),
};

/** @type {(filePath: string) => unknown} */
export const readJson = filePath => {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

/** @type {(filePath: string, data: unknown) => void} */
export const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

/** @type {(version: string) => string} */
export const normalizeVersionInput = version => {
  return version.startsWith('v') ? version.slice(1) : version;
};

/** @type {(label: string, version: string) => void} */
export const assertVersionLike = (label, version) => {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid ${label} version: ${version}`);
  }
};

/** @type {() => VersionState} */
export const readVersionState = () => {
  const rootPackage = /** @type {{ version?: string }} */ (readJson(versionFiles.rootPackage));
  const packageLock =
    /** @type {{ version?: string, packages?: Record<string, { version?: string } | undefined> }} */ (
      readJson(versionFiles.packageLock)
    );
  const serverPackage = /** @type {{ version?: string }} */ (readJson(versionFiles.serverPackage));
  const modulePackage = /** @type {{ version?: string }} */ (readJson(versionFiles.modulePackage));
  const moduleManifest = /** @type {{ version?: string }} */ (
    readJson(versionFiles.moduleManifest)
  );
  const sharedPackage = /** @type {{ version?: string }} */ (readJson(versionFiles.sharedPackage));

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
    packageLockShared: packageLock.packages?.shared?.version,
  };
};

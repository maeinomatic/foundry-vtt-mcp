#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const rootPackagePath = path.join(root, 'package.json');
const serverPackagePath = path.join(root, 'packages', 'mcp-server', 'package.json');
const moduleManifestPath = path.join(root, 'packages', 'foundry-module', 'module.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const rootPackage = readJson(rootPackagePath);
const targetVersion = rootPackage.version;

if (!/^\d+\.\d+\.\d+([-.].+)?$/.test(targetVersion)) {
  console.error(`Invalid root package version: ${targetVersion}`);
  process.exit(1);
}

const serverPackage = readJson(serverPackagePath);
const moduleManifest = readJson(moduleManifestPath);

const changes = [];

if (serverPackage.version !== targetVersion) {
  serverPackage.version = targetVersion;
  writeJson(serverPackagePath, serverPackage);
  changes.push(`Updated packages/mcp-server/package.json to ${targetVersion}`);
}

if (moduleManifest.version !== targetVersion) {
  moduleManifest.version = targetVersion;
  writeJson(moduleManifestPath, moduleManifest);
  changes.push(`Updated packages/foundry-module/module.json to ${targetVersion}`);
}

if (changes.length === 0) {
  console.log(`Versions already in sync at ${targetVersion}`);
} else {
  console.log(`Synchronized versions to ${targetVersion}`);
  for (const change of changes) {
    console.log(`- ${change}`);
  }
}

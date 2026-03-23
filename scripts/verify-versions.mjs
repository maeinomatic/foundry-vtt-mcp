#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = {
  root: path.join(root, 'package.json'),
  server: path.join(root, 'packages', 'mcp-server', 'package.json'),
  module: path.join(root, 'packages', 'foundry-module', 'module.json')
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTag(tag) {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

const versions = {
  root: readJson(files.root).version,
  server: readJson(files.server).version,
  module: readJson(files.module).version
};

const semverLike = /^\d+\.\d+\.\d+([-.].+)?$/;
for (const [name, version] of Object.entries(versions)) {
  if (!semverLike.test(version)) {
    console.error(`Invalid ${name} version: ${version}`);
    process.exit(1);
  }
}

if (versions.server !== versions.root || versions.module !== versions.root) {
  console.error('Version mismatch detected:');
  console.error(`- root package.json: ${versions.root}`);
  console.error(`- mcp-server package.json: ${versions.server}`);
  console.error(`- foundry module.json: ${versions.module}`);
  console.error('Run: npm run version:sync');
  process.exit(1);
}

const refType = process.env.GITHUB_REF_TYPE || '';
const refName = process.env.GITHUB_REF_NAME || '';
if (refType === 'tag' && refName) {
  const tagVersion = normalizeTag(refName);
  if (tagVersion !== versions.root) {
    console.error(
      `Tag/version mismatch: tag ${refName} does not match package version ${versions.root}`
    );
    process.exit(1);
  }
}

console.log(`Version check passed (${versions.root})`);

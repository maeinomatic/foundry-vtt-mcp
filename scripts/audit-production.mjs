import { execSync } from 'node:child_process';

const ALLOWED_NO_FIX_ADVISORIES = [
  {
    id: 'GHSA-2p57-rm9w-gvfp',
    url: 'https://github.com/advisories/GHSA-2p57-rm9w-gvfp',
    packages: new Set(['ip', 'werift', 'werift-ice']),
    reason:
      'werift currently depends on ip/werift-ice and npm audit reports no fix is available upstream',
  },
];

function isAdvisoryObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedNoFixVulnerability(name, vulnerability) {
  for (const allowed of ALLOWED_NO_FIX_ADVISORIES) {
    if (!allowed.packages.has(name) || vulnerability.fixAvailable !== false) {
      continue;
    }

    const viaEntries = Array.isArray(vulnerability.via) ? vulnerability.via : [];
    const allViaAllowed = viaEntries.every(entry => {
      if (typeof entry === 'string') {
        return allowed.packages.has(entry);
      }

      if (!isAdvisoryObject(entry)) {
        return false;
      }

      const advisoryName = typeof entry.name === 'string' ? entry.name : '';
      const advisoryUrl = typeof entry.url === 'string' ? entry.url : '';
      return allowed.packages.has(advisoryName) && advisoryUrl === allowed.url;
    });

    if (allViaAllowed) {
      return allowed;
    }
  }

  return null;
}

function formatSeverity(name, vulnerability) {
  const severity =
    typeof vulnerability.severity === 'string' ? vulnerability.severity.toUpperCase() : 'UNKNOWN';
  return `${severity}: ${name}`;
}

let report;

try {
  const raw = execSync('npm audit --json --omit=dev --workspaces', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  report = JSON.parse(raw);
} catch (error) {
  const stdout =
    error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string'
      ? error.stdout
      : '';

  if (!stdout) {
    throw error;
  }

  report = JSON.parse(stdout);
}

const vulnerabilities =
  report && typeof report === 'object' && report.vulnerabilities && typeof report.vulnerabilities === 'object'
    ? report.vulnerabilities
    : {};

const remainingFailures = [];
const allowedFindings = [];

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (!isAdvisoryObject(vulnerability)) {
    continue;
  }

  const severity = typeof vulnerability.severity === 'string' ? vulnerability.severity : '';
  if (severity !== 'high' && severity !== 'critical') {
    continue;
  }

  const allowed = isAllowedNoFixVulnerability(name, vulnerability);
  if (allowed) {
    allowedFindings.push({
      label: formatSeverity(name, vulnerability),
      reason: allowed.reason,
    });
    continue;
  }

  remainingFailures.push({
    label: formatSeverity(name, vulnerability),
    fixAvailable: vulnerability.fixAvailable,
  });
}

if (allowedFindings.length > 0) {
  console.log('Allowed production audit findings:');
  for (const finding of allowedFindings) {
    console.log(`- ${finding.label}: ${finding.reason}`);
  }
}

if (remainingFailures.length > 0) {
  console.error('Production audit failed due to unapproved vulnerabilities:');
  for (const finding of remainingFailures) {
    console.error(`- ${finding.label} (fixAvailable: ${String(finding.fixAvailable)})`);
  }
  process.exit(1);
}

console.log('Production audit passed with no unapproved high/critical vulnerabilities.');

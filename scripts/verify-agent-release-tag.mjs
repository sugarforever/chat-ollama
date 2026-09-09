import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseSemanticVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  assert.ok(match, `Version ${value} must be valid SemVer`);
  if (match[4]) {
    for (const identifier of match[4].split('.')) {
      assert.ok(!/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0'), `Version ${value} must be valid SemVer`);
    }
  }
  return value;
}

export function verifyReleaseTag(tag, runtimeVersion, cliVersion) {
  assert.ok(tag.startsWith('v'), `Release tag ${tag} must match v<semver>`);
  const tagVersion = parseSemanticVersion(tag.slice(1));
  assert.equal(
    runtimeVersion,
    tagVersion,
    `Runtime and CLI versions must both equal ${tagVersion}`,
  );
  assert.equal(
    cliVersion,
    tagVersion,
    `Runtime and CLI versions must both equal ${tagVersion}`,
  );
  return tagVersion;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const tag = process.argv[2];
  assert.ok(tag, 'Usage: node scripts/verify-agent-release-tag.mjs <tag>');

  const runtimeManifest = JSON.parse(
    readFileSync(new URL('../packages/agent-runtime/package.json', import.meta.url)),
  );
  const cliManifest = JSON.parse(
    readFileSync(new URL('../packages/agent-cli/package.json', import.meta.url)),
  );
  const version = verifyReleaseTag(tag, runtimeManifest.version, cliManifest.version);
  console.log(`Agent release versions match ${version}.`);
}

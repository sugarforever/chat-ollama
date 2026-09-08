import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyReleaseTag(tag, runtimeVersion, cliVersion) {
  const match = /^agent-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
  assert.ok(match, `Release tag ${tag} must match agent-v<semver>`);

  const tagVersion = match[1];
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

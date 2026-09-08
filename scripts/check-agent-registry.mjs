import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const packages = ['chatollama-agent-runtime', 'chatollama-agent'];

export function classifyRegistryState(expectedVersion, runtimeVersion, cliVersion) {
  if (runtimeVersion === null && cliVersion === null) return 'missing';
  if (runtimeVersion === expectedVersion && cliVersion === expectedVersion) {
    return 'published';
  }
  if (runtimeVersion === null || cliVersion === null) {
    throw new Error('Registry contains a partial release; refusing to continue');
  }
  throw new Error('Registry returned an unexpected package version');
}

function readPublishedVersion(packageName, version) {
  const result = spawnSync(
    'npm',
    ['view', `${packageName}@${version}`, 'version', '--json'],
    { encoding: 'utf8' },
  );
  if (result.status === 0) return JSON.parse(result.stdout);

  const output = `${result.stdout}\n${result.stderr}`;
  if (/E404|404 Not Found/.test(output)) return null;
  throw new Error(`npm view failed for ${packageName}: ${output.trim()}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const expectedVersion = process.argv[2];
  assert.ok(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion ?? ''),
    'Usage: node scripts/check-agent-registry.mjs <semver>',
  );

  const versions = packages.map(packageName =>
    readPublishedVersion(packageName, expectedVersion),
  );
  const state = classifyRegistryState(expectedVersion, versions[0], versions[1]);
  process.stdout.write(`state=${state}\nversion=${expectedVersion}\n`);
}

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseSemanticVersion } from './verify-agent-release-tag.mjs';

export function selectReleasePullRequestBody(version, pullRequests) {
  parseSemanticVersion(version);
  assert.ok(Array.isArray(pullRequests), 'Associated pull requests must be a JSON array');
  const expectedTitle = `chore(agent): release v${version}`;
  const matches = pullRequests.filter(pullRequest =>
    pullRequest?.merged_at
    && pullRequest?.base?.ref === 'main'
    && pullRequest?.title === expectedTitle,
  );
  assert.equal(matches.length, 1, `Expected exactly one associated release PR titled ${expectedTitle}`);
  assert.equal(typeof matches[0].body, 'string', 'Release PR body must be text');
  return matches[0].body;
}

export function buildReleaseNotes(version, pullRequestBody) {
  parseSemanticVersion(version);
  const heading = /^## Release notes[ \t]*$/m.exec(pullRequestBody);
  const remainder = heading ? pullRequestBody.slice(heading.index + heading[0].length).replace(/^\r?\n/, '') : '';
  const nextHeading = /^## [^#\r\n].*$/m.exec(remainder);
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
  assert.ok(section, 'Release PR body must contain a non-empty ## Release notes section');

  return `${section}\n\n## Packages\n\n- [chatollama-agent@${version}](https://www.npmjs.com/package/chatollama-agent/v/${version})\n- [chatollama-agent-runtime@${version}](https://www.npmjs.com/package/chatollama-agent-runtime/v/${version})\n`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [version, inputPath, outputPath] = process.argv.slice(2);
  assert.ok(version && inputPath && outputPath, 'Usage: node scripts/build-agent-release-notes.mjs <version> <associated-PRs-json> <output-file>');
  const pullRequests = JSON.parse(readFileSync(inputPath, 'utf8'));
  const pullRequestBody = selectReleasePullRequestBody(version, pullRequests);
  writeFileSync(outputPath, buildReleaseNotes(version, pullRequestBody));
}

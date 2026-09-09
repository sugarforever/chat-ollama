import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyReleaseTag } from './verify-agent-release-tag.mjs';

describe('agent release tag verification', () => {
  it('accepts a matching agent tag and package versions', () => {
    assert.equal(verifyReleaseTag('agent-v0.1.0', '0.1.0', '0.1.0'), '0.1.0');
  });

  it('rejects tags outside the agent-v namespace', () => {
    assert.throws(
      () => verifyReleaseTag('v0.1.0', '0.1.0', '0.1.0'),
      /must match agent-v/,
    );
  });

  it('rejects mismatched Runtime and CLI versions', () => {
    assert.throws(
      () => verifyReleaseTag('agent-v0.1.0', '0.1.0', '0.2.0'),
      /must both equal 0.1.0/,
    );
  });
});

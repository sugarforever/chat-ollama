import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyReleaseTag } from './verify-agent-release-tag.mjs';

describe('agent release tag verification', () => {
  it('accepts a matching version tag and package versions', () => {
    assert.equal(verifyReleaseTag('v0.5.0', '0.5.0', '0.5.0'), '0.5.0');
    assert.equal(verifyReleaseTag('v1.2.3-rc.1+build.7', '1.2.3-rc.1+build.7', '1.2.3-rc.1+build.7'), '1.2.3-rc.1+build.7');
  });

  it('rejects legacy agent-prefixed tags', () => {
    assert.throws(
      () => verifyReleaseTag('agent-v0.5.0', '0.5.0', '0.5.0'),
      /must match v/,
    );
  });

  it('rejects malformed semantic versions', () => {
    for (const tag of ['v01.2.3', 'v1.02.3', 'v1.2.03', 'v1.2.3-.', 'v1.2.3-rc.', 'v1.2.3-01']) {
      assert.throws(() => verifyReleaseTag(tag, tag.slice(1), tag.slice(1)), /valid SemVer/);
    }
  });

  it('rejects mismatched Runtime and CLI versions', () => {
    assert.throws(
      () => verifyReleaseTag('v0.5.0', '0.5.0', '0.6.0'),
      /must both equal 0.5.0/,
    );
  });
});

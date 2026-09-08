import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyRegistryState } from './check-agent-registry.mjs';

describe('agent registry state', () => {
  it('publishes when neither package version exists', () => {
    assert.equal(classifyRegistryState('0.1.0', null, null), 'missing');
  });

  it('verifies when both package versions exist', () => {
    assert.equal(
      classifyRegistryState('0.1.0', '0.1.0', '0.1.0'),
      'published',
    );
  });

  it('rejects a partial release', () => {
    assert.throws(
      () => classifyRegistryState('0.1.0', '0.1.0', null),
      /partial release/,
    );
  });

  it('rejects an unexpected registry version', () => {
    assert.throws(
      () => classifyRegistryState('0.1.0', '0.2.0', '0.1.0'),
      /unexpected package version/,
    );
  });
});

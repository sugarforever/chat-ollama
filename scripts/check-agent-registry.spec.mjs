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

  it('recovers when Runtime exists and CLI is missing', () => {
    assert.equal(
      classifyRegistryState('0.1.0', '0.1.0', null),
      'recover-cli',
    );
  });

  it('rejects a CLI release without its Runtime', () => {
    assert.throws(
      () => classifyRegistryState('0.1.0', null, '0.1.0'),
      /CLI exists without its Runtime/,
    );
  });

  it('rejects an unexpected registry version', () => {
    assert.throws(
      () => classifyRegistryState('0.1.0', '0.2.0', '0.1.0'),
      /unexpected package version/,
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareFileMaps,
  retrySync,
} from './compare-agent-artifacts.mjs';

describe('published artifact comparison', () => {
  it('retries a transient registry failure until the operation succeeds', () => {
    let attempts = 0;

    const result = retrySync(
      () => {
        attempts += 1;
        if (attempts < 3) throw new Error('npm error code ETARGET');
        return 'published';
      },
      {
        attempts: 3,
        delayMs: 0,
        shouldRetry: error => error.message.includes('ETARGET'),
      },
    );

    assert.equal(result, 'published');
    assert.equal(attempts, 3);
  });

  it('does not retry a permanent artifact comparison failure', () => {
    let attempts = 0;

    assert.throws(
      () =>
        retrySync(
          () => {
            attempts += 1;
            throw new Error('published bytes differ');
          },
          {
            attempts: 3,
            delayMs: 0,
            shouldRetry: error => error.message.includes('ETARGET'),
          },
        ),
      /published bytes differ/,
    );
    assert.equal(attempts, 1);
  });

  it('accepts identical unpacked package files', () => {
    const files = new Map([
      ['package/package.json', Buffer.from('{"name":"example"}')],
      ['package/dist/index.js', Buffer.from('export {};')],
    ]);

    assert.doesNotThrow(() => compareFileMaps('example', files, new Map(files)));
  });

  it('rejects changed published bytes', () => {
    const local = new Map([['package/dist/index.js', Buffer.from('local')]]);
    const published = new Map([
      ['package/dist/index.js', Buffer.from('published')],
    ]);

    assert.throws(
      () => compareFileMaps('example', local, published),
      /differs at package\/dist\/index.js/,
    );
  });

  it('rejects missing or extra published files', () => {
    const local = new Map([['package/dist/index.js', Buffer.from('same')]]);
    const published = new Map([
      ['package/dist/index.js', Buffer.from('same')],
      ['package/src/index.ts', Buffer.from('source')],
    ]);

    assert.throws(
      () => compareFileMaps('example', local, published),
      /file list differs/,
    );
  });
});

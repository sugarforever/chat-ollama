import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareFileMaps } from './compare-agent-artifacts.mjs';

describe('published artifact comparison', () => {
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

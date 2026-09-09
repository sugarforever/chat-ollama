import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PassThrough } from 'node:stream';

import { rgPath } from '@vscode/ripgrep';
import type { ToolSet } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceTools } from './workspace-tools.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'chatollama-workspace-'));
  temporaryDirectories.push(path);
  return path;
}

async function execute(
  tools: ToolSet,
  name: string,
  input: unknown,
  abortSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const result = await tools[name]!.execute!(input as never, {
    toolCallId: 'test-call',
    messages: [],
    abortSignal,
    context: undefined,
  });
  if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
    throw new Error('Unexpected streaming tool result');
  }
  return result as Record<string, unknown>;
}

describe('workspace tools', () => {
  it('creates parent directories and atomically creates or overwrites text files', async () => {
    const root = await workspace();
    const tools = createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'write_file', { path: 'notes/today.txt', content: 'first\n' })).resolves.toEqual({
      ok: true, path: 'notes/today.txt', bytesWritten: 6, created: true,
    });
    await expect(readFile(join(root, 'notes', 'today.txt'), 'utf8')).resolves.toBe('first\n');

    await expect(execute(tools, 'write_file', { path: 'notes/today.txt', content: 'replaced' })).resolves.toEqual({
      ok: true, path: 'notes/today.txt', bytesWritten: 8, created: false,
    });
    await expect(readFile(join(root, 'notes', 'today.txt'), 'utf8')).resolves.toBe('replaced');
  });

  it('performs one exact edit and rejects zero or multiple matches without changing the file', async () => {
    const root = await workspace();
    await writeFile(join(root, 'unique.txt'), 'before needle after');
    await writeFile(join(root, 'zero.txt'), 'unchanged');
    await writeFile(join(root, 'multiple.txt'), 'needle and needle');
    const tools = createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'edit_file', {
      path: 'unique.txt', oldText: 'needle', newText: 'replacement',
    })).resolves.toEqual({
      ok: true, path: 'unique.txt', bytesWritten: 24, replacements: 1,
    });
    await expect(readFile(join(root, 'unique.txt'), 'utf8')).resolves.toBe('before replacement after');

    await expect(execute(tools, 'edit_file', {
      path: 'zero.txt', oldText: 'needle', newText: 'replacement',
    })).resolves.toEqual({
      ok: false, error: { code: 'EDIT_NOT_FOUND', message: 'Exact text was not found in the file.' },
    });
    await expect(execute(tools, 'edit_file', {
      path: 'multiple.txt', oldText: 'needle', newText: 'replacement',
    })).resolves.toEqual({
      ok: false, error: { code: 'EDIT_NOT_UNIQUE', message: 'Exact text occurs more than once in the file.' },
    });
    await expect(readFile(join(root, 'zero.txt'), 'utf8')).resolves.toBe('unchanged');
    await expect(readFile(join(root, 'multiple.txt'), 'utf8')).resolves.toBe('needle and needle');
  });

  it('rejects oversized writes and edits before changing workspace files', async () => {
    const root = await workspace();
    await writeFile(join(root, 'existing.txt'), 'keep');
    const tools = createWorkspaceTools({ workspaceRoot: root });
    const oversized = 'x'.repeat(1_048_577);

    for (const [name, input] of [
      ['write_file', { path: 'too-large.txt', content: oversized }],
      ['edit_file', { path: 'existing.txt', oldText: 'keep', newText: oversized }],
    ] as const) {
      await expect(execute(tools, name, input)).resolves.toEqual({
        ok: false, error: { code: 'CONTENT_TOO_LARGE', message: 'File content exceeds the 1,048,576-byte limit.' },
      });
    }
    await expect(readFile(join(root, 'existing.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('rejects an edit when the file grows beyond the limit during its read', async () => {
    const root = await workspace();
    await writeFile(join(root, 'changing.txt'), 'needle');
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: { readFile: async () => Buffer.from('needle'.repeat(200_000)) },
    });

    await expect(execute(tools, 'edit_file', {
      path: 'changing.txt', oldText: 'needle', newText: 'replacement',
    })).resolves.toEqual({
      ok: false, error: { code: 'CONTENT_TOO_LARGE', message: 'File content exceeds the 1,048,576-byte limit.' },
    });
    await expect(readFile(join(root, 'changing.txt'), 'utf8')).resolves.toBe('needle');
  });

  it('maps cancellation during an edit read to CANCELLED without changing the file', async () => {
    const root = await workspace();
    await writeFile(join(root, 'cancel.txt'), 'needle');
    const controller = new AbortController();
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: {
        readFile: async () => {
          controller.abort();
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        },
      },
    });

    await expect(execute(tools, 'edit_file', {
      path: 'cancel.txt', oldText: 'needle', newText: 'replacement',
    }, controller.signal)).resolves.toEqual({
      ok: false, error: { code: 'CANCELLED', message: 'Tool execution was cancelled.' },
    });
    await expect(readFile(join(root, 'cancel.txt'), 'utf8')).resolves.toBe('needle');
  });

  it('rejects write escapes through lexical paths, prefix confusion, and symlinks', async () => {
    const root = await workspace();
    const outside = await workspace();
    const sibling = `${root}-sibling`;
    await mkdir(sibling);
    temporaryDirectories.push(sibling);
    await symlink(outside, join(root, 'escape'));
    const tools = createWorkspaceTools({ workspaceRoot: root });

    for (const path of ['../outside.txt', join(outside, 'absolute.txt'), `../${basename(sibling)}/prefix.txt`, 'escape/outside.txt']) {
      await expect(execute(tools, 'write_file', { path, content: 'blocked' })).resolves.toEqual({
        ok: false, error: { code: 'PATH_OUTSIDE_WORKSPACE', message: 'Path must stay within the workspace.' },
      });
    }
    await expect(readFile(join(outside, 'outside.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('revalidates the parent immediately before commit and blocks a changed symlink path', async () => {
    const root = await workspace();
    const outside = await workspace();
    await mkdir(join(root, 'safe'));
    const canonicalSafe = await realpath(join(root, 'safe'));
    let parentChecks = 0;
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: {
        realpath: async path => {
          const resolved = await realpath(path);
          if (resolved === canonicalSafe && ++parentChecks === 3) return outside;
          return resolved;
        },
      },
    });

    await expect(execute(tools, 'write_file', { path: 'safe/file.txt', content: 'blocked' })).resolves.toEqual({
      ok: false, error: { code: 'PATH_OUTSIDE_WORKSPACE', message: 'Path must stay within the workspace.' },
    });
    await expect(readFile(join(root, 'safe', 'file.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the original file and removes the temporary file when atomic replacement fails', async () => {
    const root = await workspace();
    await writeFile(join(root, 'stable.txt'), 'original');
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: { rename: async () => { throw Object.assign(new Error('simulated'), { code: 'EIO' }); } },
    });

    await expect(execute(tools, 'write_file', { path: 'stable.txt', content: 'new' })).resolves.toEqual({
      ok: false, error: { code: 'TOOL_FAILED', message: 'Workspace tool failed.' },
    });
    await expect(readFile(join(root, 'stable.txt'), 'utf8')).resolves.toBe('original');
    await expect(execute(createWorkspaceTools({ workspaceRoot: root }), 'list_directory', {})).resolves.toMatchObject({
      entries: [{ name: 'stable.txt', type: 'file' }],
    });
  });

  it('serializes writes to the same normalized path', async () => {
    const root = await workspace();
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>(resolve => { releaseFirst = resolve; });
    const committed: string[] = [];
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: {
        rename: async (source, target) => {
          const content = await readFile(source, 'utf8');
          if (content === 'first') await firstCanFinish;
          await rename(source, target);
          committed.push(content);
        },
      },
    });

    const first = execute(tools, 'write_file', { path: 'same.txt', content: 'first' });
    await vi.waitFor(() => expect(committed).toEqual([]));
    const second = execute(tools, 'write_file', { path: './same.txt', content: 'second' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(committed).toEqual([]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toMatchObject([{ ok: true }, { ok: true }]);
    expect(committed).toEqual(['first', 'second']);
    await expect(readFile(join(root, 'same.txt'), 'utf8')).resolves.toBe('second');
  });

  it('returns cancellation before a queued write changes the file', async () => {
    const root = await workspace();
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>(resolve => { releaseFirst = resolve; });
    const tools = createWorkspaceTools({
      workspaceRoot: root,
      fileSystem: {
        rename: async (source, target) => {
          if (await readFile(source, 'utf8') === 'first') await firstCanFinish;
          await rename(source, target);
        },
      },
    });
    const first = execute(tools, 'write_file', { path: 'same.txt', content: 'first' });
    const controller = new AbortController();
    const second = execute(tools, 'write_file', { path: 'same.txt', content: 'second' }, controller.signal);
    controller.abort();
    releaseFirst();

    await first;
    await expect(second).resolves.toEqual({
      ok: false, error: { code: 'CANCELLED', message: 'Tool execution was cancelled.' },
    });
    await expect(readFile(join(root, 'same.txt'), 'utf8')).resolves.toBe('first');
  });

  it('reads numbered UTF-8 lines with offset and limit', async () => {
    const root = await workspace();
    await writeFile(join(root, 'notes.txt'), 'alpha\nbéta\ngamma\n');
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'read_file', { path: 'notes.txt', offset: 2, limit: 2 })).resolves.toMatchObject({
      ok: true,
      content: '2: béta\n3: gamma',
      truncated: false,
      startLine: 2,
      endLine: 3,
    });
  });

  it('reports empty files and hard line truncation explicitly', async () => {
    const root = await workspace();
    await writeFile(join(root, 'empty.txt'), '');
    await writeFile(join(root, 'long.txt'), Array.from({ length: 2_100 }, (_, index) => `line-${index + 1}`).join('\n'));
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'read_file', { path: 'empty.txt' })).resolves.toMatchObject({
      ok: true, content: '', truncated: false, startLine: 0, endLine: 0,
    });
    const result = await execute(tools, 'read_file', { path: 'long.txt', limit: 2_100 });
    expect(result).toMatchObject({ ok: true, truncated: true, endLine: 2_000 });
    expect(String(result.content)).toContain('[truncated: read_file limit reached]');
  });

  it('reports byte truncation without splitting UTF-8 output', async () => {
    const root = await workspace();
    await writeFile(join(root, 'wide.txt'), `${'界'.repeat(30_000)}\n`);
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    const result = await execute(tools, 'read_file', { path: 'wide.txt' });
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(65_536);
    expect(String(result.content)).not.toContain('\uFFFD');
  });

  it('reports the last line actually included when byte truncation stops a multi-line read', async () => {
    const root = await workspace();
    await writeFile(join(root, 'wide-lines.txt'), `first\n${'x'.repeat(70_000)}\nthird\n`);
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    const result = await execute(tools, 'read_file', { path: 'wide-lines.txt' });
    expect(result).toMatchObject({
      ok: true, truncated: true, startLine: 1, endLine: 2,
    });
    expect(String(result.content)).toContain('2: xxx');
  });

  it('returns stable errors for missing paths and unsupported types', async () => {
    const root = await workspace();
    await mkdir(join(root, 'folder'));
    await writeFile(join(root, 'file.txt'), 'text');
    await writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'read_file', { path: 'missing.txt' })).resolves.toEqual({
      ok: false, error: { code: 'PATH_NOT_FOUND', message: 'Path does not exist in the workspace.' },
    });
    await expect(execute(tools, 'read_file', { path: 'folder' })).resolves.toEqual({
      ok: false, error: { code: 'UNSUPPORTED_TYPE', message: 'read_file requires a regular file.' },
    });
    await expect(execute(tools, 'list_directory', { path: 'file.txt' })).resolves.toEqual({
      ok: false, error: { code: 'UNSUPPORTED_TYPE', message: 'list_directory requires a directory.' },
    });
    await expect(execute(tools, 'read_file', { path: 'invalid.txt' })).resolves.toEqual({
      ok: false, error: { code: 'INVALID_UTF8', message: 'File is not valid UTF-8 text.' },
    });
  });

  it('sorts directory entries and identifies their types', async () => {
    const root = await workspace();
    await writeFile(join(root, 'z.txt'), 'z');
    await mkdir(join(root, 'a-dir'));
    await symlink('z.txt', join(root, 'link'));
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'list_directory', {})).resolves.toMatchObject({
      ok: true,
      entries: [
        { name: 'a-dir', type: 'directory' },
        { name: 'link', type: 'symlink' },
        { name: 'z.txt', type: 'file' },
      ],
      truncated: false,
    });
  });

  it('rejects lexical, absolute, prefix-confusion, and symlink escapes', async () => {
    const root = await workspace();
    const outside = await workspace();
    await writeFile(join(outside, 'secret.txt'), 'never expose');
    await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'));
    const sibling = `${root}-sibling`;
    await mkdir(sibling);
    temporaryDirectories.push(sibling);
    await writeFile(join(sibling, 'secret.txt'), 'prefix confusion');
    const tools = await createWorkspaceTools({ workspaceRoot: root });
    const attempts = [
      '../secret.txt',
      join(outside, 'secret.txt'),
      `../${basename(sibling)}/secret.txt`,
      'escape.txt',
    ];

    for (const path of attempts) {
      await expect(execute(tools, 'read_file', { path })).resolves.toEqual({
        ok: false,
        error: { code: 'PATH_OUTSIDE_WORKSPACE', message: 'Path must stay within the workspace.' },
      });
    }
  });

  it('returns a stable cancellation result before filesystem work', async () => {
    const root = await workspace();
    await writeFile(join(root, 'notes.txt'), 'text');
    const tools = await createWorkspaceTools({ workspaceRoot: root });
    const controller = new AbortController();
    controller.abort();

    for (const [name, input] of [
      ['read_file', { path: 'notes.txt' }],
      ['list_directory', {}],
      ['grep', { query: 'text' }],
      ['find_files', { pattern: '*.txt' }],
      ['write_file', { path: 'created.txt', content: 'text' }],
      ['edit_file', { path: 'notes.txt', oldText: 'text', newText: 'updated' }],
    ] as const) {
      await expect(execute(tools, name, input, controller.signal)).resolves.toEqual({
        ok: false, error: { code: 'CANCELLED', message: 'Tool execution was cancelled.' },
      });
    }
  });

  it('searches content and files with bounded, workspace-relative results', async () => {
    const root = await workspace();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'a.ts'), 'const needle = 1;\n');
    await writeFile(join(root, 'src', 'b.ts'), 'const other = 2;\nconst needle = 3;\n');
    await writeFile(join(root, 'README.md'), 'needle\n');
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    await expect(execute(tools, 'grep', { query: 'needle', path: 'src' })).resolves.toMatchObject({
      ok: true,
      matches: [
        { path: 'src/a.ts', line: 1, text: 'const needle = 1;' },
        { path: 'src/b.ts', line: 2, text: 'const needle = 3;' },
      ],
      truncated: false,
    });
    await expect(execute(tools, 'grep', { query: 'absent' })).resolves.toMatchObject({
      ok: true, matches: [], truncated: false,
    });
    await expect(execute(tools, 'find_files', { pattern: '*.ts', path: 'src' })).resolves.toMatchObject({
      ok: true, files: ['src/a.ts', 'src/b.ts'], truncated: false,
    });
    await expect(execute(tools, 'find_files', { pattern: '*.go' })).resolves.toMatchObject({
      ok: true, files: [], truncated: false,
    });
  });

  it('reports truncation at directory, match, and file-count limits', async () => {
    const root = await workspace();
    const many = join(root, 'many');
    await mkdir(many);
    await Promise.all(Array.from({ length: 1_005 }, (_, index) =>
      writeFile(join(many, `item-${String(index).padStart(4, '0')}.txt`), index < 105 ? 'needle\n' : 'other\n')));
    const tools = await createWorkspaceTools({ workspaceRoot: root });

    const listing = await execute(tools, 'list_directory', { path: 'many' });
    expect(listing).toMatchObject({ ok: true, truncated: true });
    expect(listing.entries).toHaveLength(1_000);
    expect(Buffer.byteLength(JSON.stringify(listing))).toBeLessThanOrEqual(65_536);

    const matches = await execute(tools, 'grep', { query: 'needle', path: 'many' });
    expect(matches).toMatchObject({ ok: true, truncated: true });
    expect(matches.matches).toHaveLength(100);
    expect(Buffer.byteLength(JSON.stringify(matches))).toBeLessThanOrEqual(65_536);

    const files = await execute(tools, 'find_files', { pattern: '*.txt', path: 'many' });
    expect(files).toMatchObject({ ok: true, truncated: true });
    expect(files.files).toHaveLength(1_000);
    expect(Buffer.byteLength(JSON.stringify(files))).toBeLessThanOrEqual(65_536);
  });

  it('passes model search text as one argv value and never enables a shell', async () => {
    const root = await workspace();
    const child = fakeChild('', 1);
    const spawn = vi.fn((..._args: [string, readonly string[], { shell: false }]) => child as never);
    const tools = await createWorkspaceTools({ workspaceRoot: root, spawn });
    const query = 'needle; touch /tmp/injected';

    await execute(tools, 'grep', { query });

    expect(spawn).toHaveBeenCalledOnce();
    const [executable, argv, options] = spawn.mock.calls[0]!;
    expect(executable).toBe(rgPath);
    expect(argv.filter((value: string) => value === query)).toHaveLength(1);
    expect(argv).toContain('--');
    expect(options).toMatchObject({ shell: false });
  });

  it('passes a model glob as one argv value and never enables a shell', async () => {
    const root = await workspace();
    const child = fakeChild('', 1);
    const spawn = vi.fn((..._args: [string, readonly string[], { shell: false }]) => child as never);
    const tools = await createWorkspaceTools({ workspaceRoot: root, spawn });
    const pattern = '*.ts; touch /tmp/injected';

    await execute(tools, 'find_files', { pattern });

    const [executable, argv, options] = spawn.mock.calls[0]!;
    expect(executable).toBe(rgPath);
    expect(argv.filter((value: string) => value === pattern)).toHaveLength(1);
    expect(argv[argv.indexOf('--glob') + 1]).toBe(pattern);
    expect(options).toMatchObject({ shell: false });
  });

  it('terminates ripgrep and reports truncation for an oversized incomplete record', async () => {
    const root = await workspace();
    const child = fakeChild('x'.repeat(140_000), 0);
    const tools = await createWorkspaceTools({
      workspaceRoot: root,
      spawn: vi.fn((..._args: [string, readonly string[], { shell: false }]) => child as never),
    });

    await expect(execute(tools, 'grep', { query: 'needle' })).resolves.toMatchObject({
      ok: true, matches: [], truncated: true,
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('drains ripgrep stderr so diagnostics cannot block completion', async () => {
    const root = await workspace();
    const child = fakeChild('', 1, 'diagnostic\n'.repeat(20_000));
    const tools = await createWorkspaceTools({
      workspaceRoot: root,
      spawn: vi.fn((..._args: [string, readonly string[], { shell: false }]) => child as never),
    });

    await expect(execute(tools, 'grep', { query: 'needle' })).resolves.toMatchObject({
      ok: true, matches: [], truncated: false,
    });
  });

  it('kills ripgrep and returns CANCELLED when the run is aborted', async () => {
    const root = await workspace();
    const child = fakeChild('', null);
    const spawn = vi.fn((..._args: [string, readonly string[], { shell: false }]) => child as never);
    const tools = await createWorkspaceTools({ workspaceRoot: root, spawn });
    const controller = new AbortController();

    const pending = execute(tools, 'grep', { query: 'needle' }, controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).resolves.toEqual({
      ok: false, error: { code: 'CANCELLED', message: 'Tool execution was cancelled.' },
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

function fakeChild(stdout: string, exitCode: number | null, stderr = '') {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
    return true;
  });
  let completionScheduled = false;
  child.on('newListener', event => {
    if (event !== 'close' || exitCode === null || completionScheduled) return;
    completionScheduled = true;
    queueMicrotask(() => {
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      child.emit('close', exitCode, null);
    });
  });
  return child;
}

import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

const MAX_OUTPUT_BYTES = 65_536;
const MAX_RESULT_DATA_BYTES = 64_000;
const MAX_READ_LINES = 2_000;
const MAX_DIRECTORY_ENTRIES = 1_000;
const MAX_GREP_MATCHES = 100;
const MAX_FOUND_FILES = 1_000;

type Spawn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; shell: false; stdio: ['ignore', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams;

export interface CreateWorkspaceToolsOptions {
  readonly workspaceRoot: string;
  readonly spawn?: Spawn;
}

type ErrorCode =
  | 'CANCELLED'
  | 'INVALID_UTF8'
  | 'PATH_NOT_FOUND'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'SEARCH_FAILED'
  | 'TOOL_FAILED'
  | 'UNSUPPORTED_TYPE';

interface ToolErrorResult {
  readonly ok: false;
  readonly error: { readonly code: ErrorCode; readonly message: string };
}

class WorkspaceToolError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

const errorMessages: Record<ErrorCode, string> = {
  CANCELLED: 'Tool execution was cancelled.',
  INVALID_UTF8: 'File is not valid UTF-8 text.',
  PATH_NOT_FOUND: 'Path does not exist in the workspace.',
  PATH_OUTSIDE_WORKSPACE: 'Path must stay within the workspace.',
  SEARCH_FAILED: 'Workspace search failed.',
  TOOL_FAILED: 'Workspace tool failed.',
  UNSUPPORTED_TYPE: 'Path type is not supported.',
};

export function createWorkspaceTools(options: CreateWorkspaceToolsOptions): ToolSet {
  const workspaceRoot = realpathSync(options.workspaceRoot);
  const spawn = options.spawn ?? (nodeSpawn as Spawn);

  return {
    read_file: tool({
      description: 'Read UTF-8 text lines from a file inside the workspace.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Workspace-relative file path.'),
        offset: z.number().int().min(1).optional().describe('One-based first line. Defaults to 1.'),
        limit: z.number().int().min(1).max(MAX_READ_LINES).optional().describe(`Maximum lines. Hard limit ${MAX_READ_LINES}.`),
      }),
      execute: async (input, execution) => withStableErrors(async () => {
        throwIfAborted(execution.abortSignal);
        const target = await resolveWorkspacePath(workspaceRoot, input.path);
        const stats = await lstat(target);
        if (!stats.isFile()) {
          throw new WorkspaceToolError('UNSUPPORTED_TYPE', 'read_file requires a regular file.');
        }
        let bytes: Buffer;
        try {
          bytes = await readFile(target, { signal: execution.abortSignal });
        } catch (error) {
          if (execution.abortSignal?.aborted) {
            throw new WorkspaceToolError('CANCELLED', errorMessages.CANCELLED);
          }
          throw error;
        }
        throwIfAborted(execution.abortSignal);
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new WorkspaceToolError('INVALID_UTF8', errorMessages.INVALID_UTF8);
        }
        const lines = splitLines(text);
        if (lines.length === 0) {
          return { ok: true as const, content: '', truncated: false, startLine: 0, endLine: 0, limits: readLimits() };
        }
        const start = Math.min(input.offset ?? 1, lines.length + 1);
        const requestedLimit = Math.min(input.limit ?? MAX_READ_LINES, MAX_READ_LINES);
        const selected = lines.slice(start - 1, start - 1 + requestedLimit);
        const numbered = selected.map((line, index) => `${start + index}: ${line}`);
        const hasMoreLines = start - 1 + selected.length < lines.length;
        const bounded = boundStrings(numbered, MAX_RESULT_DATA_BYTES, '\n', '[truncated: read_file limit reached]');
        const truncated = hasMoreLines || bounded.truncated;
        const content = truncated && !bounded.value.endsWith('[truncated: read_file limit reached]')
          ? appendMarker(bounded.value, '[truncated: read_file limit reached]', MAX_RESULT_DATA_BYTES)
          : bounded.value;
        return {
          ok: true as const,
          content,
          truncated,
          startLine: selected.length === 0 ? 0 : start,
          endLine: bounded.includedValues === 0 ? 0 : start + bounded.includedValues - 1,
          limits: readLimits(),
        };
      }),
    }),
    list_directory: tool({
      description: 'List sorted entries in a directory inside the workspace.',
      inputSchema: z.object({
        path: z.string().optional().describe('Workspace-relative directory path. Defaults to the workspace root.'),
      }),
      execute: async (input, execution) => withStableErrors(async () => {
        throwIfAborted(execution.abortSignal);
        const target = await resolveWorkspacePath(workspaceRoot, input.path ?? '.');
        const stats = await lstat(target);
        if (!stats.isDirectory()) {
          throw new WorkspaceToolError('UNSUPPORTED_TYPE', 'list_directory requires a directory.');
        }
        const directoryEntries = await readdir(target, { withFileTypes: true });
        directoryEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
        const entries: Array<{ name: string; type: 'directory' | 'file' | 'symlink' | 'other' }> = [];
        let bytes = 0;
        let truncated = false;
        for (const entry of directoryEntries) {
          throwIfAborted(execution.abortSignal);
          const item = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' as const
              : entry.isFile() ? 'file' as const
                : entry.isSymbolicLink() ? 'symlink' as const : 'other' as const,
          };
          const itemBytes = Buffer.byteLength(JSON.stringify(item));
          const separatorBytes = entries.length === 0 ? 0 : 1;
          if (entries.length >= MAX_DIRECTORY_ENTRIES || bytes + separatorBytes + itemBytes > MAX_RESULT_DATA_BYTES) {
            truncated = true;
            break;
          }
          entries.push(item);
          bytes += separatorBytes + itemBytes;
        }
        return {
          ok: true as const,
          entries,
          truncated,
          limits: { maxEntries: MAX_DIRECTORY_ENTRIES, maxBytes: MAX_OUTPUT_BYTES },
        };
      }),
    }),
    grep: tool({
      description: 'Search file contents inside the workspace and return file, line, and matching text.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Literal search text. It is never interpreted as a command or option.'),
        path: z.string().optional().describe('Workspace-relative file or directory. Defaults to the workspace root.'),
      }),
      execute: async (input, execution) => withStableErrors(async () => {
        throwIfAborted(execution.abortSignal);
        const target = await resolveWorkspacePath(workspaceRoot, input.path ?? '.');
        const stats = await lstat(target);
        if (!stats.isFile() && !stats.isDirectory()) {
          throw new WorkspaceToolError('UNSUPPORTED_TYPE', 'grep requires a regular file or directory.');
        }
        const matches: Array<{ path: string; line: number; text: string }> = [];
        let outputBytes = 0;
        let truncated = false;
        const processResult = await runRipgrep({
          spawn,
          workspaceRoot,
          args: ['--json', '--fixed-strings', '--color', 'never', '--max-count', String(MAX_GREP_MATCHES + 1), '--', input.query, target],
          abortSignal: execution.abortSignal,
          onLine: line => {
            let record: RipgrepJson;
            try {
              record = JSON.parse(line) as RipgrepJson;
            } catch {
              throw new WorkspaceToolError('SEARCH_FAILED', errorMessages.SEARCH_FAILED);
            }
            if (record.type !== 'match' || !record.data?.path?.text || !record.data.lines?.text || !record.data.line_number) return true;
            const item = {
              path: toWorkspacePath(workspaceRoot, record.data.path.text),
              line: record.data.line_number,
              text: record.data.lines.text.replace(/\r?\n$/, ''),
            };
            const itemBytes = Buffer.byteLength(JSON.stringify(item));
            const separatorBytes = matches.length === 0 ? 0 : 1;
            if (matches.length >= MAX_GREP_MATCHES || outputBytes + separatorBytes + itemBytes > MAX_RESULT_DATA_BYTES) {
              truncated = true;
              return false;
            }
            matches.push(item);
            outputBytes += separatorBytes + itemBytes;
            return true;
          },
        });
        truncated ||= processResult.truncated;
        matches.sort((left, right) => left.path.localeCompare(right.path, 'en') || left.line - right.line);
        return {
          ok: true as const,
          matches,
          truncated,
          limits: { maxMatches: MAX_GREP_MATCHES, maxBytes: MAX_OUTPUT_BYTES },
        };
      }),
    }),
    find_files: tool({
      description: 'Find files by glob inside a workspace directory.',
      inputSchema: z.object({
        pattern: z.string().min(1).describe('A ripgrep glob such as **/*.ts or README.md.'),
        path: z.string().optional().describe('Workspace-relative directory. Defaults to the workspace root.'),
      }),
      execute: async (input, execution) => withStableErrors(async () => {
        throwIfAborted(execution.abortSignal);
        const target = await resolveWorkspacePath(workspaceRoot, input.path ?? '.');
        const stats = await lstat(target);
        if (!stats.isDirectory()) {
          throw new WorkspaceToolError('UNSUPPORTED_TYPE', 'find_files requires a directory.');
        }
        const files: string[] = [];
        let outputBytes = 0;
        let truncated = false;
        const processResult = await runRipgrep({
          spawn,
          workspaceRoot,
          args: ['--files', '--hidden', '--glob', input.pattern, '--', target],
          abortSignal: execution.abortSignal,
          onLine: line => {
            const path = toWorkspacePath(workspaceRoot, line);
            const itemBytes = Buffer.byteLength(JSON.stringify(path));
            const separatorBytes = files.length === 0 ? 0 : 1;
            if (files.length >= MAX_FOUND_FILES || outputBytes + separatorBytes + itemBytes > MAX_RESULT_DATA_BYTES) {
              truncated = true;
              return false;
            }
            files.push(path);
            outputBytes += separatorBytes + itemBytes;
            return true;
          },
        });
        truncated ||= processResult.truncated;
        files.sort((left, right) => left.localeCompare(right, 'en'));
        return {
          ok: true as const,
          files,
          truncated,
          limits: { maxFiles: MAX_FOUND_FILES, maxBytes: MAX_OUTPUT_BYTES },
        };
      }),
    }),
  };
}

async function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): Promise<string> {
  if (isAbsolute(requestedPath)) {
    throw new WorkspaceToolError('PATH_OUTSIDE_WORKSPACE', errorMessages.PATH_OUTSIDE_WORKSPACE);
  }
  const lexical = resolve(workspaceRoot, requestedPath);
  if (!isWithin(workspaceRoot, lexical)) {
    throw new WorkspaceToolError('PATH_OUTSIDE_WORKSPACE', errorMessages.PATH_OUTSIDE_WORKSPACE);
  }
  let canonical: string;
  try {
    canonical = await realpath(lexical);
  } catch (error) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      throw new WorkspaceToolError('PATH_NOT_FOUND', errorMessages.PATH_NOT_FOUND);
    }
    throw error;
  }
  if (!isWithin(workspaceRoot, canonical)) {
    throw new WorkspaceToolError('PATH_OUTSIDE_WORKSPACE', errorMessages.PATH_OUTSIDE_WORKSPACE);
  }
  return canonical;
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

function toWorkspacePath(workspaceRoot: string, target: string): string {
  return relative(workspaceRoot, resolve(workspaceRoot, target)).split(sep).join('/');
}

async function withStableErrors<T>(operation: () => Promise<T>): Promise<T | ToolErrorResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof WorkspaceToolError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return { ok: false, error: { code: 'PATH_NOT_FOUND', message: errorMessages.PATH_NOT_FOUND } };
    }
    return { ok: false, error: { code: 'TOOL_FAILED', message: errorMessages.TOOL_FAILED } };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new WorkspaceToolError('CANCELLED', errorMessages.CANCELLED);
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function readLimits() {
  return { maxLines: MAX_READ_LINES, maxBytes: MAX_OUTPUT_BYTES };
}

function boundStrings(values: readonly string[], maxBytes: number, separator: string, marker: string) {
  let value = '';
  for (const [index, item] of values.entries()) {
    const candidate = value ? `${value}${separator}${item}` : item;
    if (Buffer.byteLength(candidate) > maxBytes) {
      const suffix = candidate ? `\n${marker}` : marker;
      const availableValueBytes = Math.max(0, maxBytes - Buffer.byteLength(suffix));
      const currentValuePrefix = value ? `${value}${separator}` : '';
      const includesCurrentValue = Buffer.byteLength(currentValuePrefix) < availableValueBytes;
      return {
        value: appendMarker(candidate, marker, maxBytes),
        truncated: true,
        includedValues: index + (includesCurrentValue ? 1 : 0),
      };
    }
    value = candidate;
  }
  return { value, truncated: false, includedValues: values.length };
}

function appendMarker(value: string, marker: string, maxBytes: number): string {
  const suffix = value ? `\n${marker}` : marker;
  const allowedBytes = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  return `${truncateUtf8(value, allowedBytes)}${suffix}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

interface RipgrepJson {
  readonly type?: string;
  readonly data?: {
    readonly path?: { readonly text?: string };
    readonly lines?: { readonly text?: string };
    readonly line_number?: number;
  };
}

async function runRipgrep(options: {
  readonly spawn: Spawn;
  readonly workspaceRoot: string;
  readonly args: readonly string[];
  readonly abortSignal?: AbortSignal;
  readonly onLine: (line: string) => boolean;
}): Promise<{ truncated: boolean }> {
  throwIfAborted(options.abortSignal);
  return new Promise((resolvePromise, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = options.spawn('rg', options.args, {
        cwd: options.workspaceRoot,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new WorkspaceToolError('SEARCH_FAILED', errorMessages.SEARCH_FAILED));
      return;
    }
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let truncated = false;
    let stoppedForLimit = false;
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      options.abortSignal?.removeEventListener('abort', onAbort);
      operation();
    };
    const onAbort = () => {
      void child.kill('SIGTERM');
      finish(() => reject(new WorkspaceToolError('CANCELLED', errorMessages.CANCELLED)));
    };
    options.abortSignal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (stoppedForLimit || settled) return;
      pending += decoder.write(chunk);
      if (Buffer.byteLength(pending) > MAX_OUTPUT_BYTES * 2 && !pending.includes('\n')) {
        truncated = true;
        stoppedForLimit = true;
        void child.kill('SIGTERM');
        return;
      }
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, '');
        pending = pending.slice(newline + 1);
        try {
          if (line && !options.onLine(line)) {
            truncated = true;
            stoppedForLimit = true;
            void child.kill('SIGTERM');
            return;
          }
        } catch (error) {
          void child.kill('SIGTERM');
          finish(() => reject(error));
          return;
        }
        newline = pending.indexOf('\n');
      }
    });
    child.stderr.on('data', () => {
      // Always drain diagnostics so the child cannot block on a full pipe.
    });
    child.on('error', () => finish(() => reject(new WorkspaceToolError('SEARCH_FAILED', errorMessages.SEARCH_FAILED))));
    child.on('close', code => finish(() => {
      if (!stoppedForLimit) {
        pending += decoder.end();
        const line = pending.replace(/\r$/, '');
        try {
          if (line && !options.onLine(line)) truncated = true;
        } catch (error) {
          reject(error);
          return;
        }
      }
      if (code === 0 || code === 1 || stoppedForLimit) {
        resolvePromise({ truncated });
      } else {
        reject(new WorkspaceToolError('SEARCH_FAILED', errorMessages.SEARCH_FAILED));
      }
    }));
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
const packageDefinitions = [
  {
    key: 'runtime',
    name: 'chatollama-agent-runtime',
    directory: 'packages/agent-runtime',
  },
  {
    key: 'cli',
    name: 'chatollama-agent',
    directory: 'packages/agent-cli',
  },
];

export function compareFileMaps(packageName, localFiles, publishedFiles) {
  const localPaths = [...localFiles.keys()].sort();
  const publishedPaths = [...publishedFiles.keys()].sort();
  assert.deepEqual(
    publishedPaths,
    localPaths,
    `${packageName} published file list differs from the tag artifact`,
  );
  for (const path of localPaths) {
    assert.ok(
      localFiles.get(path).equals(publishedFiles.get(path)),
      `${packageName} differs at ${path}`,
    );
  }
}

export function retrySync(
  operation,
  { attempts, delayMs, shouldRetry, onRetry = () => {} },
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (attempt === attempts || !shouldRetry(error)) throw error;
      onRetry(error, attempt);
      if (delayMs > 0) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  }
  throw new Error('Retry operation exhausted unexpectedly');
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
    );
  }
}

function onlyTarball(directory) {
  const tarballs = readdirSync(directory).filter(name => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, `Expected one tarball in ${directory}`);
  return join(directory, tarballs[0]);
}

function collectFiles(root, directory = root) {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [childPath, contents] of collectFiles(root, path)) {
        files.set(childPath, contents);
      }
    } else {
      files.set(relative(root, path), readFileSync(path));
    }
  }
  return files;
}

function comparePackage(definition, version, temporaryDirectory) {
  const localPack = join(temporaryDirectory, `${definition.key}-local-pack`);
  const remotePack = join(temporaryDirectory, `${definition.key}-remote-pack`);
  const localFiles = join(temporaryDirectory, `${definition.key}-local-files`);
  const remoteFiles = join(temporaryDirectory, `${definition.key}-remote-files`);
  for (const directory of [localPack, remotePack, localFiles, remoteFiles]) {
    mkdirSync(directory);
  }

  run(
    'pnpm',
    ['pack', '--pack-destination', localPack],
    join(repositoryRoot, definition.directory),
  );
  retrySync(
    () =>
      run(
        'npm',
        [
          'pack',
          `${definition.name}@${version}`,
          '--pack-destination',
          remotePack,
        ],
        repositoryRoot,
      ),
    {
      attempts: 13,
      delayMs: 5_000,
      shouldRetry: error => /\b(?:ETARGET|E404)\b/.test(error.message),
      onRetry: (_error, attempt) =>
        console.warn(
          `${definition.name}@${version} is not visible yet; retrying npm pack (${attempt}/12).`,
        ),
    },
  );
  run('tar', ['-xzf', onlyTarball(localPack), '-C', localFiles], repositoryRoot);
  run('tar', ['-xzf', onlyTarball(remotePack), '-C', remoteFiles], repositoryRoot);

  compareFileMaps(
    definition.name,
    collectFiles(localFiles),
    collectFiles(remoteFiles),
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const version = process.argv[2];
  const selection = process.argv[3] ?? 'all';
  assert.ok(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? ''),
    'Usage: node scripts/compare-agent-artifacts.mjs <semver> [runtime|all]',
  );
  assert.ok(
    selection === 'runtime' || selection === 'all',
    'Artifact selection must be runtime or all',
  );

  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'chatollama-agent-compare-'),
  );
  let completed = false;
  try {
    const selectedPackages =
      selection === 'runtime'
        ? packageDefinitions.filter(definition => definition.key === 'runtime')
        : packageDefinitions;
    for (const definition of selectedPackages) {
      comparePackage(definition, version, temporaryDirectory);
    }
    completed = true;
    console.log(`Published Agent artifacts match version ${version}.`);
  } catch (error) {
    console.error(`Artifact comparison files kept at: ${temporaryDirectory}`);
    throw error;
  } finally {
    if (completed) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

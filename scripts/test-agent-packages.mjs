import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'chatollama-agent-pack-'));
let completed = false;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    input: options.input,
    stdio: options.input === undefined ? 'pipe' : ['pipe', 'pipe', 'pipe'],
  });
}

function pack(packageDirectory) {
  const before = new Set(readdirSync(temporaryDirectory));
  run('pnpm', ['pack', '--pack-destination', temporaryDirectory], {
    cwd: join(repositoryRoot, packageDirectory),
  });
  const tarballName = readdirSync(temporaryDirectory).find(name => !before.has(name));
  assert.ok(tarballName, `pnpm pack did not create a tarball for ${packageDirectory}`);
  return join(temporaryDirectory, tarballName);
}

function inspectTarball(tarball, expected) {
  const entries = run('tar', ['-tzf', tarball]).trim().split('\n');
  const manifest = JSON.parse(run('tar', ['-xOzf', tarball, 'package/package.json']));

  assert.equal(manifest.name, expected.name);
  assert.equal(manifest.private, undefined, `${expected.name} must be publishable`);
  assert.equal(manifest.license, 'SEE LICENSE IN LICENSE');
  assert.equal(manifest.engines?.node, '>=24');
  assert.equal(
    manifest.repository?.url,
    'git+https://github.com/sugarforever/chat-ollama.git',
  );
  assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE']);
  assert.ok(entries.includes('package/README.md'), `${expected.name} is missing README.md`);
  assert.ok(entries.includes('package/LICENSE'), `${expected.name} is missing LICENSE`);

  for (const requiredEntry of expected.entries) {
    assert.ok(entries.includes(requiredEntry), `${expected.name} is missing ${requiredEntry}`);
  }

  for (const entry of entries) {
    assert.doesNotMatch(entry, /^package\/(?:src|examples|test-utils)\//);
    assert.doesNotMatch(entry, /\.spec\.[cm]?[jt]s$/);
    assert.doesNotMatch(entry, /(?:^|\/)\.env(?:\.|$)/);
  }

  return manifest;
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

try {
  const runtimeTarball = pack('packages/agent-runtime');
  const cliTarball = pack('packages/agent-cli');

  const runtimeManifest = inspectTarball(runtimeTarball, {
    name: 'chatollama-agent-runtime',
    entries: ['package/dist/index.js', 'package/dist/index.d.ts'],
  });
  const cliManifest = inspectTarball(cliTarball, {
    name: 'chatollama-agent',
    entries: ['package/dist/main.js', 'package/dist/main.d.ts'],
  });

  assert.equal(runtimeManifest.exports?.['.']?.import, './dist/index.js');
  assert.equal(runtimeManifest.exports?.['.']?.types, './dist/index.d.ts');
  assert.equal(runtimeManifest.main, './dist/index.js');
  assert.equal(runtimeManifest.types, './dist/index.d.ts');
  assert.equal(runtimeManifest.repository?.directory, 'packages/agent-runtime');
  assert.equal(cliManifest.bin?.['chatollama-agent'], './dist/main.js');
  assert.equal(cliManifest.types, './dist/main.d.ts');
  assert.equal(cliManifest.repository?.directory, 'packages/agent-cli');
  assert.equal(
    cliManifest.dependencies?.['chatollama-agent-runtime'],
    runtimeManifest.version,
  );
  assert.doesNotMatch(JSON.stringify(cliManifest), /workspace:|file:/);

  const installDirectory = join(temporaryDirectory, 'installation');
  mkdirSync(installDirectory);
  run('npm', ['init', '--yes'], { cwd: installDirectory });
  run('npm', ['install', '--ignore-scripts', runtimeTarball], { cwd: installDirectory });
  run('npm', ['install', '--ignore-scripts', cliTarball], { cwd: installDirectory });

  rmSync(runtimeTarball);
  const installedPackages = [
    join(installDirectory, 'node_modules', 'chatollama-agent-runtime'),
    join(installDirectory, 'node_modules', 'chatollama-agent'),
  ];
  const executable = join(installDirectory, 'node_modules', '.bin', 'chatollama-agent');
  assert.ok(statSync(executable).isFile(), 'local chatollama-agent bin is missing');

  for (const installedPackage of installedPackages) {
    for (const file of walkFiles(installedPackage).filter(path => path.endsWith('.js'))) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /(?:from\s+|import\()['"](?:\.\.\/)*src\//);
      assert.doesNotMatch(source, /(?:--import\s+|from\s+['"]|import\(['"])tsx/);
    }
  }

  const fakeDiscovery = `globalThis.fetch = async input => {
    const url = String(input);
    if (url === 'http://localhost:11434/api/tags') return Response.json({ models: [{ name: 'pack-model' }] });
    if (url === 'https://api.openai.com/v1/models') return Response.json({ data: [{ id: 'pack-remote' }] });
    throw new Error('Unexpected network request in artifact test');
  };`;
  const environment = {
    ...process.env,
    HOME: join(temporaryDirectory, 'home'),
    USERPROFILE: join(temporaryDirectory, 'home'),
    APPDATA: join(temporaryDirectory, 'config'),
    XDG_CONFIG_HOME: join(temporaryDirectory, 'config'),
    AGENT_PROVIDER: 'ollama',
    AGENT_MODEL: 'pack-model',
    AGENT_BASE_URL: '',
    AGENT_API_KEY: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    OPENROUTER_API_KEY: '',
    NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(fakeDiscovery)}`,
    npm_config_cache: join(temporaryDirectory, 'npm-cache'),
  };
  const pipeOutput = execFileSync(executable, [], {
    cwd: installDirectory,
    env: environment,
    input: '/models\n1\n/model ollama/pack-model\n/exit\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  assert.match(pipeOutput, /ollama\/pack-model \(current\)/);
  assert.match(pipeOutput, /Switched to ollama\/pack-model\./);
  assert.match(pipeOutput, /Goodbye\./);
  assert.doesNotMatch(pipeOutput, /\x1b/);
  const npxOutput = execFileSync('npx', ['--no-install', 'chatollama-agent'], {
    cwd: installDirectory,
    env: environment,
    input: '/models\n/exit\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  assert.match(npxOutput, /ollama\/pack-model/);
  assert.doesNotMatch(npxOutput, /\x1b/);
  const remoteOutput = execFileSync(executable, [], {
    cwd: installDirectory,
    env: {
      ...environment,
      AGENT_PROVIDER: 'openai',
      AGENT_MODEL: 'gpt-5-mini',
      OPENAI_API_KEY: 'validation-placeholder',
    },
    input: '/models\n/model openai/pack-remote\n/exit\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  assert.match(remoteOutput, /openai\/pack-remote/);
  assert.match(remoteOutput, /Switched to openai\/pack-remote\./);
  assert.doesNotMatch(remoteOutput, /\x1b|validation-placeholder/);

  completed = true;
  console.log('Agent package tarballs passed clean-install checks.');
} catch (error) {
  console.error(`Agent package test artifacts kept at: ${temporaryDirectory}`);
  throw error;
} finally {
  if (completed) rmSync(temporaryDirectory, { recursive: true, force: true });
}

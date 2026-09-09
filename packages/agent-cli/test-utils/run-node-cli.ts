import { spawn } from 'node:child_process';

export interface CliProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runNodeCli(
  script: string,
  input: string,
  env: NodeJS.ProcessEnv = {},
): Promise<CliProcessResult> {
  const child = spawn(
    process.execPath,
    ['--no-warnings', '--import', 'tsx', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'pipe',
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.stdin.end(input);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  return { exitCode, stdout, stderr };
}

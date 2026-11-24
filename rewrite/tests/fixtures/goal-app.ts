import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function goalApp(baseUrl: string) {
  const directory = await mkdtemp(join(tmpdir(), 'goal-app-'));
  const probe = createServer(); await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(r => probe.close(() => r()));
  const origin = `http://127.0.0.1:${port}`;
  const proc = fork('server.mjs', [], { execArgv: [], env: { ...process.env, CHATOLLAMA_LOCAL: '0', DATA_DIR: directory, CHAT_BASE_URL: baseUrl, CHAT_MODEL_ID: 'fixture', HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; proc.stderr?.on('data', d => stderr += d);
  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) { const exit = new Promise(r => proc.once('exit', r)); proc.kill('SIGTERM'); await exit; }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    let ready = false;
    for (let n = 0; n < 400; n++) {
      if (proc.exitCode !== null) throw Error(stderr);
      try { if ((await fetch(origin + '/')).status === 200) { ready = true; break; } } catch { /* Starting */ }
      await new Promise(r => setTimeout(r, 25));
    }
    if (!ready) throw Error(`Server did not start: ${stderr}`);
    return { origin, directory, proc, close, request(path: string, value?: unknown) { return fetch(origin + path, value === undefined ? {} : { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) }); } };
  } catch (error) { await close(); throw error; }
}

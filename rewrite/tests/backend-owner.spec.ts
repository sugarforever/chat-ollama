import { afterEach, expect, test } from "vitest";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { acquireBackendOwner } from "../desktop/backend-owner.mjs";

const directories: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "backend-owner-"));
  directories.push(path);
  return path;
}
async function childOwner(path: string) {
  const module = pathToFileURL(
    join(process.cwd(), "desktop/backend-owner.mjs"),
  ).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { acquireBackendOwner } from ${JSON.stringify(module)};
    try {
      const owner = acquireBackendOwner(${JSON.stringify(path)});
      process.send('owned');
      setInterval(() => {}, 1000);
    } catch (error) { process.send(error.code); }
  `,
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  children.push(child);
  return { child, result: (await once(child, "message"))[0] };
}

test("only one process owns a canonical data directory, including aliases", async () => {
  const path = await directory();
  const first = await childOwner(path);
  expect(first.result).toBe("owned");
  const alias = join(await directory(), "alias");
  await symlink(path, alias);
  expect((await childOwner(alias)).result).toBe("BACKEND_IN_USE");
});

test("process death releases ownership without deleting a lock file", async () => {
  const path = await directory();
  const first = await childOwner(path);
  first.child.kill("SIGKILL");
  await once(first.child, "exit");
  expect((await childOwner(path)).result).toBe("owned");
});

test("simultaneous first launches elect exactly one owner", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = await directory();
    const contenders = await Promise.all([childOwner(path), childOwner(path)]);
    expect(contenders.map(({ result }) => result).sort()).toEqual([
      "BACKEND_IN_USE", "owned",
    ]);
  }
});

test("discovery credentials are private and removed before releasing ownership", async () => {
  const path = await directory();
  const owner = acquireBackendOwner(path);
  try {
    owner.publish({
      protocol: 1,
      origin: "http://127.0.0.1:12345",
      token: "secret",
      instance: "test",
    });
    const file = join(path, "backend.json");
    expect(JSON.parse(await readFile(file, "utf8")).token).toBe("secret");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  } finally {
    owner.close();
  }
  await expect(readFile(join(path, "backend.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  acquireBackendOwner(path).close();
});

test("fatal startup exits even when a partially opened runtime leaves handles alive", async () => {
  const path = await directory();
  await mkdir(join(path, "desktop"));
  await mkdir(join(path, "build"));
  await cp("server.mjs", join(path, "server.mjs"));
  await cp(
    "desktop/backend-owner.mjs",
    join(path, "desktop/backend-owner.mjs"),
  );
  await writeFile(
    join(path, "build/startup.js"),
    'setInterval(() => {}, 1000); throw new Error("fixture startup failure");',
  );
  const child = spawn(process.execPath, [join(path, "server.mjs")], {
    env: { ...process.env, DATA_DIR: join(path, "data") },
    stdio: "ignore",
  });
  children.push(child);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
  try {
    expect((await once(child, "exit"))[0]).toBe(1);
  } finally {
    clearTimeout(timeout);
  }
  acquireBackendOwner(join(path, "data")).close();
});

import { afterEach, expect, test } from "vitest";
import { fork } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelServer } from "./fixtures/model-server";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});
async function until<T>(
  read: () => T | Promise<T>,
  predicate: (value: T) => boolean,
) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Condition not reached");
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "pi-recovery-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const model = await modelServer();
  cleanups.push(() => model.close());
  function child() {
    const messages: any[] = [];
    let stderr = "";
    const proc = fork("tests/fixtures/runtime-child.ts", [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, DATA_DIR: directory, BASE_URL: model.baseUrl },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    proc.stderr?.on("data", (x) => (stderr += x));
    proc.on("message", (x) => messages.push(x));
    cleanups.push(async () => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
        await new Promise((r) => proc.once("exit", r));
      }
    });
    return {
      proc,
      messages,
      async ready() {
        await until(
          () => {
            if (proc.exitCode !== null) throw new Error(stderr);
            return messages;
          },
          (x) => x.some((m) => m.event === "ready"),
        );
      },
      send(command: string, id = "one", extra = {}) {
        proc.send({ command, id, ...extra });
      },
      async snapshot(id = "one") {
        const count = messages.length;
        proc.send({ command: "snapshot", id });
        return (
          await until(
            () => messages.slice(count),
            (x) => x.some((m) => m.event === "snapshot"),
          )
        ).find((m) => m.event === "snapshot").snapshot;
      },
    };
  }
  return { directory, model, child };
}
// Catches removing explicit resume, changing the storage path, or attaching work lifetime to observers.
test("SIGKILL resumes admitted work without resubmission and does not repeat completed work", async () => {
  const { directory, model, child } = await setup();
  const first = child();
  await first.ready();
  first.send("submit", "one", { requestId: "req-1", content: "Remember this" });
  await until(
    () => model.requests.length,
    (x) => x === 1,
  );
  expect((await stat(join(directory, "one.sqlite"))).size).toBeGreaterThan(0);
  expect(
    (await first.snapshot()).entries.some(
      (e: any) => e.kind === "user" && e.content === "Remember this",
    ),
  ).toBe(true);
  first.proc.kill("SIGKILL");
  await new Promise((r) => first.proc.once("exit", r));
  model.release();
  const second = child();
  await second.ready();
  await until(
    () => model.requests.length,
    (count) => count === 2,
  );
  second.send("snapshot");
  const done = await until(
    () => second.snapshot(),
    (x) =>
      x.status === "idle" &&
      x.entries.some((e: any) => e.content === "Recovered answer"),
  );
  expect(done.entries.filter((e: any) => e.kind === "user")).toHaveLength(1);
  expect(model.requests).toHaveLength(2);
  second.send("close");
  await new Promise((r) => second.proc.once("exit", r));
  const third = child();
  await third.ready();
  expect(
    (await third.snapshot()).entries.some(
      (e: any) => e.content === "Recovered answer",
    ),
  ).toBe(true);
  await new Promise((r) => setTimeout(r, 150));
  expect(model.requests).toHaveLength(2);
  expect(
    model.requests.every(
      (r) =>
        r.path === "/custom/v1/chat/completions" &&
        r.authorization === "Bearer fixture-secret",
    ),
  ).toBe(true);
});
// Catches one shared file/harness for distinct conversations, or observer-driven work.
test("independent conversations finish concurrently without browser observers", async () => {
  const { model, child } = await setup();
  const app = child();
  await app.ready();
  app.send("submit", "one", { requestId: "a", content: "First" });
  app.send("submit", "two", { requestId: "b", content: "Second" });
  await until(
    () => model.requests.length,
    (x) => x === 2,
  );
  model.release();
  for (const id of ["one", "two"]) {
    const done = await until(
      () => app.snapshot(id),
      (x) => x.status === "idle",
    );
    expect(
      done.entries
        .filter((e: any) => e.kind === "user")
        .map((e: any) => e.content),
    ).toEqual([id === "one" ? "First" : "Second"]);
    expect(
      done.entries.some((e: any) => e.content === "Recovered answer"),
    ).toBe(true);
  }
});
// Catches a broken upstream watch callback or failing to cancel model work on explicit Stop.
test("committed watches publish progress and Stop settles a held run", async () => {
  const { model, child } = await setup();
  const app = child();
  await app.ready();
  app.send("watch");
  await until(
    () => app.messages,
    (x) => x.some((m) => m.event === "snapshot"),
  );
  app.send("submit", "one", { requestId: "stop-me", content: "Wait here" });
  await until(
    () => model.requests.length,
    (x) => x === 1,
  );
  await until(
    () => app.messages,
    (x) =>
      x.some((m) => m.event === "snapshot" && m.snapshot.status === "running"),
  );
  app.send("stop");
  await until(
    () => app.messages,
    (x) => x.some((m) => m.event === "stop"),
  );
  expect((await app.snapshot()).status).toBe("idle");
});

// Catches cancelling the durable run when the last browser subscription disconnects.
test("detaching a browser observer leaves admitted work running", async () => {
  const { model, child } = await setup();
  const app = child();
  await app.ready();
  app.send("watch");
  app.send("submit", "one", {
    requestId: "detach",
    content: "Continue without me",
  });
  await until(
    () => model.requests.length,
    (x) => x === 1,
  );
  app.send("detach");
  await until(
    () => app.messages,
    (x) => x.some((m) => m.event === "detach"),
  );
  model.release();
  const done = await until(
    () => app.snapshot(),
    (x) =>
      x.status === "idle" &&
      x.entries.some((e: any) => e.content === "Recovered answer"),
  );
  expect(done.entries.filter((e: any) => e.kind === "user")).toHaveLength(1);
  expect(model.requests).toHaveLength(1);
});

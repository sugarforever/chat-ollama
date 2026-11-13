import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export async function discoverBackend(directory) {
  let descriptor;
  try {
    descriptor = JSON.parse(
      await readFile(join(directory, "backend.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return;
    throw error;
  }
  const { protocol, origin, token, instance } = descriptor;
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Invalid backend discovery origin");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.origin !== origin ||
    typeof token !== "string" ||
    token.length < 32 ||
    typeof instance !== "string"
  )
    throw new Error("Invalid backend discovery descriptor");
  if (protocol !== 1)
    throw new Error(
      "Incompatible backend protocol; quit the existing backend before upgrading",
    );
  try {
    const response = await fetch(`${origin}/_desktop/health`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return;
    const health = await response.json();
    if (health.protocol === 1 && health.instance === instance)
      return descriptor;
  } catch {
    /* Stale descriptor or a backend still starting. */
  }
}

export async function connectBackend({
  directory,
  node,
  server,
  timeoutMs = 30000,
  env = {},
}) {
  const existing = await discoverBackend(directory);
  if (existing) return { ...existing, owned: false, close: async () => {} };
  const instance = randomUUID();
  const child = spawn(node, [server], {
    cwd: dirname(server),
    env: {
      ...process.env,
      ...env,
      DATA_DIR: directory,
      CHATOLLAMA_LOCAL: "1",
      CHATOLLAMA_INSTANCE: instance,
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  let spawnError;
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  let closing;
  const close = () =>
    (closing ??= (async () => {
      if (child.exitCode !== null || child.signalCode !== null || spawnError)
        return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    })());
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      // Exit 75 means another client won the ownership race. Wait for its descriptor.
      if (
        child.signalCode ||
        (child.exitCode !== null && child.exitCode !== 75)
      )
        throw new Error(
          `Backend exited (${child.signalCode || child.exitCode}). ${stderr}`,
        );
      const ready = await discoverBackend(directory);
      if (ready) {
        const owned = ready.instance === instance;
        if (!owned) await close();
        return {
          ...ready,
          owned,
          close: owned ? close : async () => {},
          child: owned ? child : undefined,
        };
      }
      await delay(100);
    }
    throw new Error("Backend readiness timed out");
  } catch (error) {
    await close();
    throw error;
  }
}

import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { acquireBackendOwner } from "./desktop/backend-owner.mjs";

const local = process.env.CHATOLLAMA_LOCAL === "1";
let owner;
try {
  owner = acquireBackendOwner(resolve(process.env.DATA_DIR || "data"));
} catch (error) {
  console.error(error.message);
  process.exit(error.code === "BACKEND_IN_USE" ? 75 : 1);
}
process.env.DATA_DIR = owner.directory;
// Pending filesystem work can outlive a disconnected HTTP request. Keep the
// lease until process exit, even after graceful runtime shutdown has finished.
process.once("exit", () => owner.close());
const token = randomBytes(32).toString("hex");
const instance = process.env.CHATOLLAMA_INSTANCE || randomUUID();
let runtime;
let server;
let closing;
let booted = false;
let stopRequested = false;
const mutations = new Set();
async function shutdown() {
  stopRequested = true;
  // Startup may still be opening storage. Keep ownership until it settles.
  if (!booted) return;
  return (closing ??= (async () => {
    // Stop admission first; close the runtime before releasing the data lease.
    server?.close();
    const timeout = setTimeout(() => process.exit(1), 15000);
    timeout.unref();
    try {
      await Promise.allSettled([...mutations]);
      await runtime?.close();
    } finally {
      server?.closeAllConnections();
      clearTimeout(timeout);
      if (process.connected) process.disconnect();
    }
  })());
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
// An owned backend follows its launcher even if Electron crashes.
if (local && process.connected) process.on("disconnect", () => void shutdown());
try {
  const { startup } = await import("./build/startup.js");
  runtime = await startup();
  // Allow multipart overhead around the 20 MiB skill import limit.
  process.env.BODY_SIZE_LIMIT ||= String(22 * 1024 * 1024);
  let handler;
  server = createServer((request, response) => {
    if (closing) {
      response.writeHead(503).end("Stopping");
      return;
    }
    if (local) {
      const authorization = Buffer.from(request.headers.authorization || "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (
        authorization.length !== expected.length ||
        !timingSafeEqual(authorization, expected)
      ) {
        response.writeHead(401).end("Local backend authentication required");
        return;
      }
      if (
        request.headers.host !== new URL(process.env.ORIGIN).host ||
        (request.headers.origin &&
          request.headers.origin !== process.env.ORIGIN)
      ) {
        response.writeHead(403).end("Same-origin request required");
        return;
      }
      if (request.url === "/_desktop/health") {
        response.writeHead(handler ? 200 : 503, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ protocol: 1, instance }));
        return;
      }
    }
    if (!handler) {
      response.writeHead(503).end("Starting");
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      // adapter-node middleware does not consistently return its SSR promise.
      // Drain mutation responses, not long-lived SSE subscriptions.
      const completed = new Promise((resolve) => {
        const done = () => {
          response.off("finish", done);
          response.off("close", done);
          mutations.delete(completed);
          resolve();
        };
        response.once("finish", done);
        response.once("close", done);
      });
      mutations.add(completed);
    }
    handler(request, response);
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(
      local ? 0 : Number(process.env.PORT || 3000),
      local ? "127.0.0.1" : process.env.HOST || "0.0.0.0",
      accept,
    );
  });
  if (local) process.env.ORIGIN = `http://127.0.0.1:${server.address().port}`;
  ({ handler } = await import("./build/handler.js"));
  if (local)
    owner.publish({
      protocol: 1,
      origin: process.env.ORIGIN,
      token,
      instance,
      pid: process.pid,
    });
} catch (error) {
  console.error(error);
  stopRequested = true;
  process.exitCode = 1;
} finally {
  booted = true;
  if (stopRequested) await shutdown();
  // A failed bootstrap may have left workers/timers without returning a runtime.
  if (process.exitCode) process.exit(process.exitCode);
}

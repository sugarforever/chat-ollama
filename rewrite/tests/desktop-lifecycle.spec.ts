import { afterEach, beforeAll, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { connectBackend, discoverBackend } from "../desktop/backend-client.mjs";
import { externalUrl } from "../desktop/url-policy.cjs";

beforeAll(() => execFileSync("pnpm", ["build"], { stdio: "pipe" }), 120000);
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function options() {
  const directory = await mkdtemp(join(tmpdir(), "desktop-lifecycle-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    node: process.execPath,
    server: join(process.cwd(), "server.mjs"),
    timeoutMs: 15000,
  };
}

test("managed backend rejects anonymous access and a wrong Origin, and preserves settings on restart", async () => {
  const config = await options();
  const first = await connectBackend(config);
  cleanup.push(() => first.close());
  const headers = {
    authorization: `Bearer ${first.token}`,
    origin: first.origin,
    "content-type": "application/json",
  };
  expect((await fetch(first.origin + "/api/settings")).status).toBe(401);
  expect(
    (
      await fetch(first.origin + "/", {
        headers: { ...headers, origin: "https://evil.test" },
      })
    ).status,
  ).toBe(403);
  const saved = await fetch(first.origin + "/api/knowledge-bases", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Desktop persistence" }),
  });
  expect(saved.status).toBe(201);
  await first.close();
  const second = await connectBackend(config);
  cleanup.push(() => second.close());
  const response = await fetch(second.origin + "/api/knowledge-bases", {
    headers: { authorization: `Bearer ${second.token}` },
  });
  expect(await response.text()).toContain("Desktop persistence");
});

test("concurrent clients share one backend and attached clients cannot shut it down", async () => {
  const config = await options();
  const clients = await Promise.all([
    connectBackend(config),
    connectBackend(config),
  ]);
  for (const client of clients) cleanup.push(() => client.close());
  expect(clients[0].origin).toBe(clients[1].origin);
  expect(clients.filter((client) => client.owned)).toHaveLength(1);
  await clients.find((client) => !client.owned)!.close();
  expect((await discoverBackend(config.directory))?.origin).toBe(
    clients[0].origin,
  );
  await clients.find((client) => client.owned)!.close();
  expect(await discoverBackend(config.directory)).toBeUndefined();
});

test("backend startup failure is reported without waiting for the readiness timeout", async () => {
  const config = await options();
  await expect(
    connectBackend({
      ...config,
      server: join(config.directory, "missing.mjs"),
    }),
  ).rejects.toThrow(/exited/);
});

test("graceful shutdown finishes an admitted upload before closing storage", async () => {
  const config = await options();
  const backend = await connectBackend(config);
  cleanup.push(() => backend.close());
  const headers = {
    authorization: `Bearer ${backend.token}`,
    origin: backend.origin,
    "content-type": "application/json",
  };
  await fetch(backend.origin + "/api/settings", {
    method: "POST",
    headers,
    body: JSON.stringify({
      embedding: { baseUrl: "http://127.0.0.1:9/v1", modelId: "fixture" },
    }),
  });
  const collection = await (
    await fetch(backend.origin + "/api/knowledge-bases", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Shutdown upload" }),
    })
  ).json();
  const body =
    '--upload\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\nApples grow in an orchard.\r\n--upload--\r\n';
  const upload = httpRequest(
    backend.origin + `/api/knowledge-bases/${collection.id}/documents`,
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=upload",
        "content-length": Buffer.byteLength(body),
        expect: "100-continue",
      },
    },
  );
  const response = new Promise<number>((resolve, reject) => {
    upload.on("response", (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode!));
    });
    upload.on("error", reject);
  });
  // Mark failures handled while the test deliberately holds the request body.
  void response.catch(() => {});
  upload.flushHeaders();
  await once(upload, "continue");
  backend.child!.kill("SIGTERM");
  // The admitted request is waiting on its body when shutdown starts.
  await new Promise((resolve) => setTimeout(resolve, 100));
  upload.end(body);
  expect(await response).toBe(202);
  await backend.close();
});

test.each([
  [
    "https://auth.openai.com/oauth?state=test",
    "https://auth.openai.com/oauth?state=test",
  ],
  ["http://localhost:1234/callback", "http://localhost:1234/callback"],
  ["javascript:alert(1)", undefined],
  ["file:///etc/passwd", undefined],
  ["https://user:secret@example.com/", undefined],
  ["not a url", undefined],
])("external navigation validates %s", (input, expected) => {
  expect(externalUrl(input)).toBe(expected);
});

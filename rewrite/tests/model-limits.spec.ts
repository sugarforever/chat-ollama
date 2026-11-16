import { normalizeContext } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicSettings, saveSettings, resolveChatEndpoint } from "../src/lib/server/settings";
import { effectiveModelMetadata } from "../src/lib/server/model-limits";
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function setup(config?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "model-capabilities-"));
  dirs.push(dir);
  vi.stubEnv("DATA_DIR", dir);
  if (config !== undefined) await writeFile(join(dir, "model-capabilities.json"), JSON.stringify(config));
  return dir;
}
const provider = { id: "local", name: "Local", baseUrl: "http://localhost:11434/v1", modelId: "small", apiKey: "secret" };
const selection = { providerId: "local", modelId: "small" };
test("deployment capabilities load per connection and model; API edits cannot override them", async () => {
  await setup({ local: { small: { contextWindow: 8192, maxTokens: 256 }, large: { contextWindow: 131072, maxTokens: 8192 } }, other: { small: { contextWindow: 64000, maxTokens: 512 } } });
  saveSettings({ providers: [provider, { ...provider, id: "other" }], defaultProviderId: "local" });
  expect(resolveChatEndpoint(selection).model).toMatchObject({ contextWindow: 8192, maxTokens: 256 });
  expect(resolveChatEndpoint({ ...selection, modelId: "large" }).model).toMatchObject({ contextWindow: 131072, maxTokens: 8192 });
  expect(resolveChatEndpoint({ ...selection, providerId: "other" }).model).toMatchObject({ contextWindow: 64000, maxTokens: 512 });
  saveSettings({ providers: [{ ...provider, modelLimits: { small: { contextWindow: 1024, maxTokens: 64 } } }] });
  const settings = publicSettings();
  expect(settings.providers[0]).not.toHaveProperty("modelLimits");
  expect(settings.providers[0].effectiveModel).toMatchObject({ contextWindow: 8192, maxTokens: 256, source: "config", costSource: "unknown" });
  expect(JSON.stringify(settings)).not.toContain("secret");
  saveSettings({ chat: { modelLimits: { small: { contextWindow: 1024, maxTokens: 64 } } } });
  expect(resolveChatEndpoint(selection).model!.maxTokens).toBe(256);
});
test("native catalog capabilities win; uncatalogued discovery uses deployment configuration", async () => {
  const dir = await setup();
  const settings = publicSettings();
  const native = settings.catalog.find(p => p.id === "anthropic")!.models[0];
  await writeFile(join(dir, "model-capabilities.json"), JSON.stringify({ local: { [native.id]: { contextWindow: 1024, maxTokens: 64 }, "new-model": { contextWindow: 8192, maxTokens: 256 } } }));
  saveSettings({ providers: [{ ...provider, service: "anthropic", authMode: "api_key", modelId: native.id, models: ["new-model"] }], defaultProviderId: "local" });
  expect(resolveChatEndpoint({ ...selection, modelId: native.id }).model).toMatchObject({ contextWindow: native.contextWindow, maxTokens: native.maxTokens });
  expect(publicSettings().providers[0].effectiveModel).toMatchObject({ source: "catalog", costSource: "catalog" });
  expect(resolveChatEndpoint({ ...selection, modelId: "new-model" }).model).toMatchObject({ contextWindow: 8192, maxTokens: 256 });
});
test("captured capabilities survive configuration changes while subsequent runs reload them", async () => {
  const dir = await setup({ local: { small: { contextWindow: 8192, maxTokens: 256 } } });
  saveSettings({ providers: [provider], defaultProviderId: "local" });
  const captured = JSON.parse(JSON.stringify(resolveChatEndpoint(selection)));
  await writeFile(join(dir, "model-capabilities.json"), JSON.stringify({ local: { small: { contextWindow: 131072, maxTokens: 8192 } } }));
  expect(effectiveModelMetadata(captured)).toMatchObject({ contextWindow: 8192, maxTokens: 256, source: "config" });
  expect(resolveChatEndpoint(selection).model).toMatchObject({ contextWindow: 131072, maxTokens: 8192 });
});
test("missing deployment configuration preserves compatibility defaults", async () => {
  await setup();
  saveSettings({ providers: [provider], defaultProviderId: "local" });
  expect(publicSettings().providers[0].effectiveModel).toEqual({ modelId: "small", contextWindow: 32768, maxTokens: 4096, source: "default", costSource: "unknown" });
  expect(effectiveModelMetadata(provider)).toMatchObject({ contextWindow: 32768, maxTokens: 4096, source: "default" });
});
test.each([null, [], { local: null }, { local: { small: { contextWindow: 0, maxTokens: 64 } } }, { local: { small: { contextWindow: 8192, maxTokens: 9000 } } }, { local: { small: { contextWindow: "8192", maxTokens: 64 } } }])("malformed deployment capabilities are rejected instead of silently falling back: %j", async config => {
  await setup(config);
  expect(() => saveSettings({ providers: [provider], defaultProviderId: "local" })).toThrow("Invalid model capabilities configuration");
});
test("invalid JSON is rejected without exposing file contents", async () => {
  const dir = await setup();
  await writeFile(join(dir, "model-capabilities.json"), "private-invalid-json");
  expect(() => saveSettings({ providers: [provider], defaultProviderId: "local" })).toThrow("Invalid model capabilities configuration");
});
test("Pi derives the output request from captured metadata without an application cap", async () => {
  await setup({ local: { small: { contextWindow: 8192, maxTokens: 256 } } });
  const { createServer } = await import("node:http");
  const { runtimeProvider } = await import("../src/lib/server/runtime/provider");
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    requests.push(JSON.parse(body));
    res.writeHead(400, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  try {
    saveSettings({ providers: [{ ...provider, service: "custom", authMode: "none", baseUrl: `http://127.0.0.1:${(server.address() as any).port}` }], defaultProviderId: "local" });
    const p = runtimeProvider(resolveChatEndpoint(selection));
    await p.streamSimple(p.getModels()[0], normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: Date.now() }] }), { apiKey: "fixture" }).result();
    expect(requests).toHaveLength(1);
    expect(requests[0].max_tokens ?? requests[0].max_completion_tokens).toBe(256);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  }
});

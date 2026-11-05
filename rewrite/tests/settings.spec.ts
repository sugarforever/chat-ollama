import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadChatConfig,
  loadEmbeddingConfig,
  publicSettings,
  saveSettings,
} from "../src/lib/server/settings";
import { createSessionManager } from "../src/lib/server/runtime/manager";
import { modelServer } from "./fixtures/model-server";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
  vi.unstubAllEnvs();
});
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "settings-validation-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  vi.stubEnv("DATA_DIR", dir);
  return dir;
}
// Both deployment defaults and submitted values must reject URLs that can leak credentials.
test.each(["CHAT_BASE_URL", "EMBEDDING_BASE_URL"])(
  "%s uses the same safe URL validation as saved settings",
  async (name) => {
    await directory();
    for (const url of [
      "https://admin:private-secret@example.test/v1",
      "https://example.test/v1?key=private-secret",
      "https://example.test/v1#private-secret",
      "file:///private-secret",
      "not a URL private-secret",
    ]) {
      vi.stubEnv(name, url);
      const load =
        name === "CHAT_BASE_URL" ? loadChatConfig : loadEmbeddingConfig;
      expect(() => load()).toThrow("Invalid endpoint");
      expect(() => publicSettings()).toThrow("Invalid endpoint");
      try {
        publicSettings();
      } catch (error) {
        expect(String(error)).not.toContain("private-secret");
        expect(String(error)).not.toContain(url);
      }
    }
    vi.stubEnv(name, "http://127.0.0.1:1234/custom/v1");
    expect(
      (name === "CHAT_BASE_URL" ? loadChatConfig() : loadEmbeddingConfig())
        .baseUrl,
    ).toBe("http://127.0.0.1:1234/custom/v1");
    expect(() =>
      saveSettings({ chat: { baseUrl: "not a URL private-secret" } }),
    ).toThrow("Invalid endpoint");
  },
);
// Recreates a kill after saving the new endpoint but before configuring the idle root.
test("new endpoint snapshot with the prior root model can restart and admit the next run", async () => {
  const dir = await directory();
  const model = await modelServer();
  cleanup.push(() => model.close());
  model.release();
  const old = {
    baseUrl: model.baseUrl,
    apiKey: "old-key",
    modelId: "prior-model",
  };
  let manager = createSessionManager({ directory: dir, endpoint: old });
  const { id } = await manager.createConversation({
    modelId: "prior-model",
    knowledgeBaseIds: [],
    mcpServerIds: [],
  });
  await manager.close();
  const next = { ...old, modelId: "next-model" };
  await writeFile(join(dir, `${id}.endpoint.json`), JSON.stringify(next), {
    mode: 0o600,
  });
  manager = createSessionManager({
    directory: dir,
    endpoint: next,
    loadEndpoint: () => next,
  });
  cleanup.push(() => manager.close());
  await manager.resume();
  const session = await manager.getSession(id);
  await session.submit("after-crash", "hello");
  for (let i = 0; i < 200 && model.requests.length === 0; i++)
    await new Promise((r) => setTimeout(r, 25));
  expect(JSON.parse(model.requests[0].prompt).model).toBe("next-model");
});

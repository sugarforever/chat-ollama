import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  publicSettings,
  saveSettings,
  resolveChatEndpoint,
} from "../src/lib/server/settings";
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function setup() {
  const d = await mkdtemp(join(tmpdir(), "native-providers-"));
  dirs.push(d);
  vi.stubEnv("DATA_DIR", d);
}
// A completions-only dispatch or a handwritten partial catalog breaks these assertions.
test("catalog exposes native protocols, authentication methods and provider defaults", async () => {
  await setup();
  const s = publicSettings() as any;
  expect(s.catalog.find((p: any) => p.id === "anthropic")).toMatchObject({
    baseUrl: "https://api.anthropic.com",
    authModes: expect.arrayContaining(["api_key", "oauth"]),
  });
  expect(s.catalog.find((p: any) => p.id === "openai-codex")).toMatchObject({
    authModes: ["oauth"],
  });
  expect(s.catalog.find((p: any) => p.id === "google").models[0].api).toBe(
    "google-generative-ai",
  );
  expect(s.catalog.length).toBeGreaterThan(35);
});
test("native settings capture catalog metadata, redact secrets and cannot carry a key across services", async () => {
  await setup();
  const s = publicSettings() as any;
  const model = s.catalog.find((p: any) => p.id === "anthropic").models[0];
  const p = {
    id: "native",
    name: "Work Claude",
    service: "anthropic",
    authMode: "api_key",
    modelId: model.id,
    apiKey: "private-key",
    credentialEnv: { PRIVATE: "private-env" },
  };
  saveSettings({ providers: [p], defaultProviderId: "native" });
  const endpoint = resolveChatEndpoint({
    providerId: p.id,
    modelId: model.id,
  }) as any;
  expect(endpoint.model.api).toBe("anthropic-messages");
  expect(endpoint.model.contextWindow).toBeGreaterThan(32768);
  expect(JSON.stringify(publicSettings())).not.toMatch(
    /private-key|private-env|credentialEnv/,
  );
  const openai = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "openai",
  ).models[0];
  saveSettings({
    providers: [
      {
        id: p.id,
        name: p.name,
        service: "openai",
        authMode: "api_key",
        modelId: openai.id,
      },
    ],
    defaultProviderId: p.id,
  });
  expect(
    resolveChatEndpoint({ providerId: p.id, modelId: openai.id }).apiKey,
  ).toBe("");
  expect(() =>
    resolveChatEndpoint({
      providerId: p.id,
      modelId: "not-a-real-native-model",
    }),
  ).toThrow();
  expect(() =>
    saveSettings({
      providers: [{ ...p, service: "openai-codex", authMode: "api_key" }],
    }),
  ).toThrow();
});

// Using the OpenAI adapter for Anthropic/Gemini would send the wrong path/body/auth.
test.each(["anthropic", "google"])(
  "Pi Durable dispatches %s using its native wire protocol",
  async (service) => {
    await setup();
    const { createServer } = await import("node:http");
    const requests: any[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      requests.push({
        url: req.url,
        headers: req.headers,
        body: JSON.parse(body),
      });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { createSessionManager } = await import(
      "../src/lib/server/runtime/manager"
    );
    const model = (publicSettings() as any).catalog.find(
      (p: any) => p.id === service,
    ).models[0];
    saveSettings({
      providers: [
        {
          id: "test",
          name: "Native",
          service,
          authMode: "api_key",
          baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
          apiKey: "native-key",
          modelId: model.id,
        },
      ],
      defaultProviderId: "test",
    });
    const endpoint = resolveChatEndpoint({
      providerId: "test",
      modelId: model.id,
    });
    const manager = createSessionManager({
      directory: join(dirForTest(), "sessions"),
      endpoint,
      resolveEndpoint: resolveChatEndpoint,
      defaultProviderId: () => "test",
    });
    try {
      const { id } = await manager.createConversation({
        providerId: "test",
        modelId: model.id,
        knowledgeBaseIds: [],
        mcpServerIds: [],
      });
      const session = await manager.getSession(id);
      await session.submit("wire", "hello");
      await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0), {
        timeout: 5000,
      });
      if (service === "anthropic") {
        expect(new URL(requests[0].url, "http://fixture").pathname).toBe(
          "/v1/messages",
        );
        expect(requests[0].headers["x-api-key"]).toBe("native-key");
        expect(requests[0].body.messages[0].role).toBe("user");
      } else {
        expect(requests[0].url).toContain(":streamGenerateContent");
        expect(requests[0].body.contents[0].role).toBe("user");
        expect(requests[0].headers["x-goog-api-key"]).toBe("native-key");
      }
      await session.stop();
    } finally {
      await manager.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);
function dirForTest() {
  return process.env.DATA_DIR!;
}

// Vertex's official non-key guided flow is tagged api_key but must still check the selected file.
test("scoped Vertex service-account configuration passes auth admission without ambient env", async () => {
  await setup();
  const { writeFile } = await import("node:fs/promises");
  const credentialPath = join(dirForTest(), "account.json");
  await writeFile(credentialPath, "{}");
  const model = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "google-vertex",
  ).models[0].id;
  saveSettings({
    providers: [
      {
        id: "vertex",
        name: "Cloud",
        service: "google-vertex",
        authMode: "api_key",
        modelId: model,
        credentialEnv: {
          GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
          GOOGLE_CLOUD_PROJECT: "explicit-project",
          GOOGLE_CLOUD_LOCATION: "us-central1",
        },
      },
    ],
    defaultProviderId: "vertex",
  });
  const endpoint = resolveChatEndpoint({
    providerId: "vertex",
    modelId: model,
  });
  const { createModels } = await import("@earendil-works/pi-ai/models");
  const { runtimeCredentialStore, runtimeProvider, runtimeAuthContext } =
    await import("../src/lib/server/runtime/provider");
  const { existsSync } = await import("node:fs");
  const models = createModels({
    credentials: runtimeCredentialStore(() => endpoint),
    authContext: runtimeAuthContext(() => endpoint),
  });
  models.setProvider(runtimeProvider(endpoint));
  expect(await models.getAuth("chat")).toMatchObject({
    auth: {},
    env: { GOOGLE_CLOUD_PROJECT: "explicit-project" },
  });
});

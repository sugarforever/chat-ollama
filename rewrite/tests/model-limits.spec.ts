import { normalizeContext } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  publicSettings,
  saveSettings,
  resolveChatEndpoint,
  loadProviders,
} from "../src/lib/server/settings";
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function setup() {
  const d = await mkdtemp(join(tmpdir(), "model-limits-"));
  dirs.push(d);
  vi.stubEnv("DATA_DIR", d);
}
const provider = {
  id: "local",
  name: "Local",
  baseUrl: "http://localhost:11434/v1",
  modelId: "small",
  apiKey: "secret",
};
test("legacy/custom per-model limits persist and switch without leaking credentials", async () => {
  await setup();
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: {
          small: { contextWindow: 1024, maxTokens: 128 },
          large: { contextWindow: 1000000, maxTokens: 64000 },
        },
      },
    ],
    defaultProviderId: "local",
  });
  for (const [modelId, contextWindow, maxTokens] of [
    ["small", 1024, 128],
    ["large", 1000000, 64000],
  ] as const) {
    expect(
      resolveChatEndpoint({ providerId: "local", modelId }).model,
    ).toMatchObject({ id: modelId, contextWindow, maxTokens });
  }
  expect(loadProviders().providers[0]).toHaveProperty(
    "modelLimits.large.maxTokens",
    64000,
  );
  const settings = publicSettings() as any;
  expect(settings.providers[0].effectiveModel).toMatchObject({
    modelId: "small",
    contextWindow: 1024,
    maxTokens: 128,
    source: "custom",
    costSource: "unknown",
  });
  expect(JSON.stringify(settings)).not.toContain("secret");
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "other" }).model,
  ).toMatchObject({ contextWindow: 32768, maxTokens: 4096 });
});
test.each([0, -1, 1.5, "8192", null, Number.MAX_SAFE_INTEGER + 1])(
  "invalid limit %s fails atomically",
  async (bad) => {
    await setup();
    const before = publicSettings();
    expect(() =>
      saveSettings({
        providers: [
          {
            ...provider,
            modelLimits: { small: { contextWindow: bad, maxTokens: 64 } },
          },
        ],
        defaultProviderId: "local",
        embedding: { modelId: "changed" },
      }),
    ).toThrow();
    expect(publicSettings()).toEqual(before);
  },
);
test("malformed entries and output above context fail without changing settings", async () => {
  await setup();
  const before = publicSettings();
  for (const modelLimits of [
    [],
    null,
    { small: {} },
    { small: { contextWindow: 1024 } },
    { small: { contextWindow: 64, maxTokens: 128 } },
    { "": { contextWindow: 128, maxTokens: 16 } },
  ]) {
    expect(() =>
      saveSettings({
        providers: [{ ...provider, modelLimits }],
        defaultProviderId: "local",
      }),
    ).toThrow();
    expect(publicSettings()).toEqual(before);
  }
});
test("native catalog values remain authoritative while discovered models accept overrides", async () => {
  await setup();
  const catalog = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "anthropic",
  );
  const id = catalog.models[0].id;
  saveSettings({
    providers: [
      {
        ...provider,
        service: "anthropic",
        authMode: "api_key",
        modelId: id,
        models: ["new-model"],
        modelLimits: {
          [id]: { contextWindow: 1024, maxTokens: 64 },
          "new-model": { contextWindow: 8192, maxTokens: 256 },
        },
      },
    ],
    defaultProviderId: "local",
  });
  const known = resolveChatEndpoint({ providerId: "local", modelId: id });
  expect(known.model!.contextWindow).toBeGreaterThan(32768);
  expect((publicSettings() as any).providers[0].effectiveModel).toMatchObject({
    source: "catalog",
    costSource: "catalog",
  });
  expect(catalog.models[0]).toHaveProperty("contextWindow");
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "new-model" }).model,
  ).toMatchObject({ contextWindow: 8192, maxTokens: 256 });
});

// Exercise the native adapters against a real endpoint; metadata alone cannot prove a ceiling.
test.each([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const)(
  "%s payload respects the configured output ceiling",
  async (protocol) => {
    await setup();
    const { createServer } = await import("node:http");
    const { runtimeProvider } = await import(
      "../src/lib/server/runtime/provider"
    );
    const requests: any[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      requests.push(JSON.parse(body));
      res.writeHead(400, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      saveSettings({
        providers: [
          {
            ...provider,
            baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
            service: "custom",
            authMode: "none",
            protocol,
            modelLimits: { small: { contextWindow: 32768, maxTokens: 8 } },
          },
        ],
        defaultProviderId: "local",
      });
      const endpoint = resolveChatEndpoint({
        providerId: "local",
        modelId: "small",
      });
      const p = runtimeProvider(endpoint);
      // Both entry points must enforce the ceiling, including oversized callers.
      for (const stream of [p.stream, p.streamSimple]) {
        for (const mutate of [false, true]) {
        const result = stream(
          p.getModels()[0],
          normalizeContext({
            messages: [
              { role: "user", content: "hello", timestamp: Date.now() },
            ],
          }),
          { apiKey: "fixture", maxTokens: 9999, onPayload: (payload: any) => {
            if (!mutate) return;
            const next = structuredClone(payload);
            for (const key of ['max_tokens', 'max_completion_tokens', 'max_output_tokens']) {
              if (typeof next[key] === 'number') next[key] = 9999;
            }
            if (next.config) next.config.maxOutputTokens = 9999;
            return next;
          } },
        );
        await result.result();
        }
      }
      expect(requests).toHaveLength(4);
      for (const body of requests) {
        const actual =
          protocol === "openai-responses"
            ? body.max_output_tokens
            : protocol === "google-generative-ai"
              ? body.generationConfig?.maxOutputTokens
              : (body.max_tokens ?? body.max_completion_tokens);
        expect(actual).toBe(8);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);

test("omitted overrides persist, explicit empty map clears, and changing service resets them", async () => {
  await setup();
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: { small: { contextWindow: 8192, maxTokens: 256 } },
      },
    ],
    defaultProviderId: "local",
  });
  saveSettings({ providers: [{ ...provider, name: "Renamed" }] });
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "small" }).model!
      .maxTokens,
  ).toBe(256);
  saveSettings({ providers: [{ ...provider, modelLimits: {} }] });
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "small" }).model!
      .maxTokens,
  ).toBe(4096);
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: { small: { contextWindow: 8192, maxTokens: 256 } },
      },
    ],
  });
  saveSettings({
    providers: [{ ...provider, service: "custom", authMode: "none" }],
  });
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "small" }).model!
      .maxTokens,
  ).toBe(4096);
});
test("metadata reads captured model independently of subsequent settings and supports old sidecars", async () => {
  await setup();
  const { effectiveModelMetadata } = await import(
    "../src/lib/server/model-limits"
  );
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: { small: { contextWindow: 8192, maxTokens: 256 } },
      },
    ],
    defaultProviderId: "local",
  });
  const captured = JSON.parse(
    JSON.stringify(
      resolveChatEndpoint({ providerId: "local", modelId: "small" }),
    ),
  );
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: { small: { contextWindow: 131072, maxTokens: 8192 } },
      },
    ],
  });
  expect(effectiveModelMetadata(captured)).toEqual({
    modelId: "small",
    contextWindow: 8192,
    maxTokens: 256,
    source: "custom",
    costSource: "unknown",
  });
  expect(effectiveModelMetadata({ ...provider })).toEqual({
    modelId: "small",
    contextWindow: 32768,
    maxTokens: 4096,
    source: "default",
    costSource: "unknown",
  });
});
test.each([0, -1, 1.5, "128", null, Number.MAX_SAFE_INTEGER + 1])(
  "invalid output limit %s fails atomically, including the legacy alias",
  async (bad) => {
    await setup();
    const before = publicSettings();
    for (const patch of [
      {
        providers: [
          {
            ...provider,
            modelLimits: { small: { contextWindow: 8192, maxTokens: bad } },
          },
        ],
        defaultProviderId: "local",
      },
      {
        chat: {
          modelLimits: { small: { contextWindow: 8192, maxTokens: bad } },
        },
        embedding: { modelId: "should-not-save" },
      },
      { chat: { modelLimits: null } },
    ]) {
      expect(() => saveSettings(patch)).toThrow();
      expect(publicSettings()).toEqual(before);
    }
  },
);
test("identical model IDs on separate providers keep independent limits", async () => {
  await setup();
  saveSettings({
    providers: [
      {
        ...provider,
        modelLimits: { small: { contextWindow: 8192, maxTokens: 256 } },
      },
      {
        ...provider,
        id: "other",
        modelLimits: { small: { contextWindow: 131072, maxTokens: 8192 } },
      },
    ],
    defaultProviderId: "local",
  });
  expect(
    resolveChatEndpoint({ providerId: "local", modelId: "small" }).model!
      .contextWindow,
  ).toBe(8192);
  expect(
    resolveChatEndpoint({ providerId: "other", modelId: "small" }).model!
      .contextWindow,
  ).toBe(131072);
});

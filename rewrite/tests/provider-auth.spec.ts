import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentialStore } from "../src/lib/server/provider-credentials";
import { createModels } from "@earendil-works/pi-ai/models";
import { nativeProvider } from "../src/lib/server/providers";
let dir = "";
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (dir) await rm(dir, { recursive: true, force: true });
});
// Missing serialization reuses a rotated refresh token; a nonpersistent store loses login on restart.
test("official Codex refresh rotates once across independent Models and persists the new credential", async () => {
  dir = await mkdtemp(join(tmpdir(), "oauth-refresh-"));
  vi.stubEnv("DATA_DIR", dir);
  const store = credentialStore("slot");
  const jwt = (account: string) =>
    `e30.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account } })).toString("base64url")}.signature`;
  await store.modify("openai-codex", async () => ({
    type: "oauth",
    access: jwt("old"),
    refresh: "refresh-old",
    expires: 0,
  }));
  let calls = 0;
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    expect(String(url)).toBe("https://auth.openai.com/oauth/token");
    expect(String(init.body)).toContain("refresh-old");
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return Response.json({
      access_token: jwt("new"),
      refresh_token: "refresh-new",
      expires_in: 3600,
    });
  });
  const make = () => {
    const m = createModels({ credentials: credentialStore("slot") });
    m.setProvider(nativeProvider("openai-codex"));
    return m;
  };
  const result = await Promise.all([
    make().getAuth("openai-codex"),
    make().getAuth("openai-codex"),
  ]);
  expect(calls).toBe(1);
  expect(result[0]?.auth).toEqual(result[1]?.auth);
  expect(await credentialStore("slot").read("openai-codex")).toMatchObject({
    refresh: "refresh-new",
  });
  await store.delete("openai-codex");
  expect(await make().getAuth("openai-codex")).toBeUndefined();
});

// Exercises the real upstream API-key login prompts, rather than a test-only fake flow.
test("provider login prompts are private, persist server-side and disconnect cancels pending setup", async () => {
  dir = await mkdtemp(join(tmpdir(), "auth-flow-"));
  vi.stubEnv("DATA_DIR", dir);
  const { publicSettings, saveSettings, resolveChatEndpoint } = await import(
    "../src/lib/server/settings"
  );
  const { startLogin, authStatus, answerLogin, disconnectProvider } =
    await import("../src/lib/server/provider-auth");
  const model = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "google",
  ).models[0].id;
  saveSettings({
    providers: [
      {
        id: "gemini",
        name: "Gemini",
        service: "google",
        authMode: "api_key",
        modelId: model,
      },
    ],
    defaultProviderId: "gemini",
  });
  startLogin("gemini", "api_key");
  await vi.waitFor(() =>
    expect(authStatus("gemini").flow?.prompt).toBeDefined(),
  );
  const status = authStatus("gemini");
  answerLogin(
    "gemini",
    status.flow!.id,
    status.flow!.prompt!.id,
    "secret-login-key",
  );
  await vi.waitFor(() =>
    expect(authStatus("gemini").flow?.status).toBe("connected"),
  );
  expect(JSON.stringify(authStatus("gemini"))).not.toContain(
    "secret-login-key",
  );
  expect(JSON.stringify(publicSettings())).not.toContain("secret-login-key");
  expect(
    resolveChatEndpoint({ providerId: "gemini", modelId: model }).apiKey,
  ).toBe("secret-login-key");
  await disconnectProvider("gemini");
  expect(authStatus("gemini").connected).toBe(false);
  startLogin("gemini", "api_key");
  await disconnectProvider("gemini");
  await vi.waitFor(() =>
    expect(authStatus("gemini").flow?.status).toBe("cancelled"),
  );
});

// A UI-only login stub cannot pass this: the real pi-ai device flow exchanges and stores the code.
test("official Codex device login and failed refresh never expose token material", async () => {
  dir = await mkdtemp(join(tmpdir(), "codex-device-"));
  vi.stubEnv("DATA_DIR", dir);
  const { publicSettings, saveSettings, loadProviders } = await import(
    "../src/lib/server/settings"
  );
  const { startLogin, authStatus, answerLogin, disconnectProvider } =
    await import("../src/lib/server/provider-auth");
  const model = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "openai-codex",
  ).models[0].id;
  saveSettings({
    providers: [
      {
        id: "codex",
        name: "Personal subscription",
        service: "openai-codex",
        authMode: "oauth",
        modelId: model,
      },
    ],
    defaultProviderId: "codex",
  });
  const token = `e30.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account" } })).toString("base64url")}.private-access`;
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: unknown) => {
    urls.push(String(url));
    if (String(url).endsWith("/usercode"))
      return Response.json({
        device_auth_id: "private-device-id",
        user_code: "ABCD-EFGH",
        interval: 0,
      });
    if (String(url).endsWith("/deviceauth/token"))
      return Response.json({
        authorization_code: "private-code",
        code_verifier: "private-verifier",
      });
    return Response.json({
      access_token: token,
      refresh_token: "private-refresh",
      expires_in: 3600,
    });
  });
  startLogin("codex", "oauth");
  await vi.waitFor(() =>
    expect(authStatus("codex").flow?.prompt?.type).toBe("select"),
  );
  const flow = authStatus("codex").flow!;
  answerLogin("codex", flow.id, flow.prompt!.id, "device_code");
  await vi.waitFor(() => expect(authStatus("codex").connected).toBe(true));
  expect(urls).toContain(
    "https://auth.openai.com/api/accounts/deviceauth/usercode",
  );
  expect(urls).toContain("https://auth.openai.com/oauth/token");
  expect(
    JSON.stringify({ settings: publicSettings(), status: authStatus("codex") }),
  ).not.toMatch(
    /private-access|private-refresh|private-code|private-verifier|private-device-id/,
  );
  const slot = loadProviders().providers[0].credentialId!;
  const store = credentialStore(slot);
  await store.modify(
    "openai-codex",
    async (c) => ({ ...c!, expires: 0 }) as any,
  );
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response("private-refresh upstream rejection", { status: 401 }),
  );
  const models = createModels({ credentials: store });
  models.setProvider(nativeProvider("openai-codex"));
  await expect(models.getAuth("openai-codex")).rejects.toMatchObject({
    code: "oauth",
  });
  expect(await store.read("openai-codex")).toMatchObject({
    refresh: "private-refresh",
  });
  await disconnectProvider("codex");
  expect(authStatus("codex").connected).toBe(false);
});

// The upstream AWS credential-chain choice is api_key-tagged but explicitly opts into server IAM credentials.
test("guided Bedrock credential chain resolves and disconnect removes the ambient opt-in", async () => {
  dir = await mkdtemp(join(tmpdir(), "bedrock-chain-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("AWS_ACCESS_KEY_ID", "server-identity");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "server-secret");
  const { publicSettings, saveSettings, resolveChatEndpoint, loadProviders } =
    await import("../src/lib/server/settings");
  const { runtimeAuthContext, runtimeCredentialStore, runtimeProvider } =
    await import("../src/lib/server/runtime/provider");
  const { disconnectProvider } = await import(
    "../src/lib/server/provider-auth"
  );
  const model = (publicSettings() as any).catalog.find(
    (p: any) => p.id === "amazon-bedrock",
  ).models[0].id;
  saveSettings({
    providers: [
      {
        id: "aws",
        name: "IAM",
        service: "amazon-bedrock",
        authMode: "api_key",
        modelId: model,
      },
    ],
    defaultProviderId: "aws",
  });
  const slot = loadProviders().providers[0].credentialId!;
  await credentialStore(slot).modify("amazon-bedrock", async () => ({
    type: "api_key",
  }));
  const endpoint = resolveChatEndpoint({ providerId: "aws", modelId: model });
  const models = createModels({
    credentials: runtimeCredentialStore(() => endpoint),
    authContext: runtimeAuthContext(() => endpoint),
  });
  models.setProvider(runtimeProvider(endpoint));
  expect(await models.getAuth("chat")).toMatchObject({
    source: "AWS access keys",
  });
  await disconnectProvider("aws");
  const next = resolveChatEndpoint({ providerId: "aws", modelId: model });
  expect(next.useAmbientCredentials).not.toBe(true);
  const disconnected = createModels({
    credentials: runtimeCredentialStore(() => next),
    authContext: runtimeAuthContext(() => next),
  });
  disconnected.setProvider(runtimeProvider(next));
  expect(await disconnected.getAuth("chat")).toBeUndefined();
});

// Disconnect must affect only its named connection; partial edits must preserve effective guided credentials.
test("disconnect isolates named accounts and guided key/environment edits preserve unspecified fields", async () => {
  dir = await mkdtemp(join(tmpdir(), "named-credentials-"));
  vi.stubEnv("DATA_DIR", dir);
  const { publicSettings, saveSettings, resolveChatEndpoint, loadProviders } =
    await import("../src/lib/server/settings");
  const { disconnectProvider, authStatus } = await import(
    "../src/lib/server/provider-auth"
  );
  const catalog = (publicSettings() as any).catalog;
  const providers = ["openai-codex", "azure"].map((service) => ({
    id: service,
    name: service,
    service,
    authMode: service === "azure" ? "api_key" : "oauth",
    modelId: catalog.find((p: any) => p.id === service).models[0].id,
  }));
  saveSettings({ providers, defaultProviderId: "azure" });
  const saved = loadProviders().providers;
  const codexSlot = saved[0].credentialId!;
  await credentialStore(codexSlot).modify("openai-codex", async () => ({
    type: "oauth",
    access: "private-account",
    refresh: "private-refresh",
    expires: Date.now() + 3600000,
  }));
  await credentialStore(saved[1].credentialId!).modify("azure", async () => ({
    type: "api_key",
    key: "guided-key",
    env: { AZURE_OPENAI_RESOURCE_NAME: "guided-resource" },
  }));
  saveSettings({
    providers: [
      providers[0],
      {
        ...providers[1],
        credentialEnv: { AZURE_OPENAI_RESOURCE_NAME: "edited-resource" },
      },
    ],
  });
  expect(
    resolveChatEndpoint({ providerId: "azure", modelId: providers[1].modelId }),
  ).toMatchObject({
    apiKey: "guided-key",
    credentialEnv: { AZURE_OPENAI_RESOURCE_NAME: "edited-resource" },
  });
  saveSettings({
    providers: [providers[0], { ...providers[1], apiKey: "replacement-key" }],
  });
  expect(
    resolveChatEndpoint({ providerId: "azure", modelId: providers[1].modelId }),
  ).toMatchObject({
    apiKey: "replacement-key",
    credentialEnv: { AZURE_OPENAI_RESOURCE_NAME: "edited-resource" },
  });
  await disconnectProvider("azure");
  expect(authStatus("azure").connected).toBe(false);
  expect(authStatus("openai-codex").connected).toBe(true);
  expect(loadProviders().providers[0].credentialId).toBe(codexSlot);
});

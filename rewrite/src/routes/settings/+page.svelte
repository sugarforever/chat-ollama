<script lang="ts">
  import ProviderAuth from "$lib/ProviderAuth.svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/client";
  let settings: any;
  const customAuthModes = ["none", "api_key"];
  const authModes = (service:string) => service === "custom" ? customAuthModes : settings?.catalog.find((p:any)=>p.id===service)?.authModes??[];
  let keys = { chat: "", embedding: "" };
  let clear = { chat: false, embedding: false };
  let providerEnv: Record<string, string> = {};
  let providerKeys: Record<string, string> = {};
  let clearProviderKeys: Record<string, boolean> = {};
  let error = "";
  let notice = "";
  let collections: any[] = [];
  let documents: Record<string, any[]> = {};
  let name = "";
  let servers: any[] = [];
  let replacement = "[]";
  let replace = false;
  let confirm = false;
  let timer: ReturnType<typeof setInterval>;
  async function loadCollections() {
    collections = await api("/api/knowledge-bases");
    for (const c of collections)
      documents[c.id] = await api(`/api/knowledge-bases/${c.id}/documents`);
    documents = { ...documents };
  }
  async function run(fn: () => Promise<unknown>, message = "Saved") {
    error = "";
    notice = "";
    try {
      await fn();
      notice = message;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  async function saveProviders() {
    await run(async () => {
      settings = await api("/api/settings", {
        defaultProviderId: settings.defaultProviderId,
        providers: settings.providers.map((p: any) => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          modelId: p.modelId,
          ...(p.service
            ? { service: p.service, authMode: p.authMode, protocol: p.protocol }
            : {}),
          ...(providerEnv[p.id]
            ? { credentialEnv: JSON.parse(providerEnv[p.id]) }
            : {}),
          ...(clearProviderKeys[p.id]
            ? { apiKey: "" }
            : providerKeys[p.id]
              ? { apiKey: providerKeys[p.id] }
              : {}),
        })),
      });
      providerKeys = {};
      providerEnv = {};
      clearProviderKeys = {};
    }, "Providers saved");
  }
  async function saveEmbedding() {
    await run(async () => {
      const patch: any = {
        baseUrl: settings.embedding.baseUrl,
        modelId: settings.embedding.modelId,
      };
      if (clear.embedding) patch.apiKey = "";
      else if (keys.embedding) patch.apiKey = keys.embedding;
      settings = await api("/api/settings", { embedding: patch });
      keys.embedding = "";
      clear.embedding = false;
      await loadCollections();
    }, "Embedding settings saved. Reindex collections explicitly before searching with the new configuration.");
  }
  async function upload(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    await run(async () => {
      await api(`/api/knowledge-bases/${id}/documents`, form);
      await loadCollections();
    }, "Document queued");
    input.value = "";
  }
  async function mutate(path: string, data?: unknown, method?: string) {
    await run(async () => {
      await api(path, data, method);
      await loadCollections();
    });
  }
  async function saveMcp() {
    await run(async () => {
      const next = JSON.parse(replacement);
      if (
        !Array.isArray(next) ||
        next.some((s) => "hasHeaders" in s || "hasEnvironment" in s)
      )
        throw Error(
          "Provide complete server configurations, not redacted presence flags.",
        );
      servers = (await api("/api/mcp", { servers: next }, "PUT")).servers;
      replacement = "[]";
      replace = false;
      confirm = false;
    }, "MCP configuration replaced");
  }
  onMount(() => {
    void run(async () => {
      settings = await api("/api/settings");
      servers = (await api("/api/mcp")).servers;
      await loadCollections();
    }, "");
    timer = setInterval(() => void loadCollections().catch(() => {}), 2000);
    return () => clearInterval(timer);
  });
</script>

<svelte:head><title>Settings · Chat Ollama</title></svelte:head>
<main class="settings">
  <div class="row" style="justify-content:space-between">
    <a href="/">← Back to chat</a><button
      onclick={() =>
        run(async () => {
          await api("/api/auth/logout", {});
          location.href = "/login";
        })}>Log out</button
    >
  </div>
  <h1 style="margin-top:28px">Your workspace, your way.</h1>
  <p class="muted">Configure models, curate knowledge, and connect tools.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p
      role="status"
      class="notice"
    >
      {notice}
    </p>{/if}
  <section>
    <h2>Models</h2>
    {#if settings}
      <form
        class="stack"
        onsubmit={(e) => {
          e.preventDefault();
          void saveProviders();
        }}
      >
        <h3>Chat providers</h3>
        <p class="muted">
          Defaults apply to new conversations. Editing a selected provider
          applies to its next message. Active runs keep their captured
          configuration.
        </p>
        <div class="grid">
          {#each settings.providers as p (p.id)}
            <fieldset class="card stack" aria-label={`Provider ${p.name}`}>
              <legend>{p.name}</legend>
              <label
                >Provider name<input
                  bind:value={p.name}
                  required
                  maxlength="100"
                /></label
              >
              <label
                >Model service<select
                  aria-label="Model service"
                  value={p.service ?? "legacy"}
                  onchange={(e) => {
                    const service = e.currentTarget.value;
                    const preset = settings.catalog.find(
                      (v: any) => v.id === service,
                    );
                    p.service = service === "legacy" ? undefined : service;
                    p.authMode = preset?.authModes[0] ?? "none";
                    p.baseUrl = preset?.baseUrl ?? "http://127.0.0.1:11434/v1";
                    p.modelId = preset?.models[0]?.id ?? "local";
                    providerKeys[p.id] = "";
                    providerEnv[p.id] = "";
                    settings.providers = settings.providers.map((v: any) =>
                      v.id === p.id ? { ...p } : v,
                    );
                  }}
                >
                  {#if !p.service}<option value="legacy"
                      >Custom endpoint (imported)</option
                    >{/if}
                  <option value="custom"
                    >Custom endpoint / Ollama / LM Studio</option
                  >
                  {#each settings.catalog as preset}<option
                      value={preset.id}
                      disabled={!preset.models.length}
                      >{preset.name}{preset.models.length
                        ? ""
                        : " (no chat models)"}</option
                    >{/each}
                </select></label
              >
              {#if p.service}
                <label
                  >Authentication<select
                    aria-label="Authentication"
                    value={p.authMode}
                    onchange={(e) => {
                      p.authMode = e.currentTarget.value;
                      if (p.authMode === "oauth")
                        p.baseUrl =
                          settings.catalog.find((v: any) => v.id === p.service)
                            ?.baseUrl ?? "";
                      providerKeys[p.id] = "";
                      providerEnv[p.id] = "";
                      settings = { ...settings };
                    }}
                  >
                    {#each authModes(p.service) as mode}<option
                        value={mode}
                        >{mode === "oauth"
                          ? "Account login / OAuth"
                          : mode === "ambient"
                            ? "Server credentials (AWS / ADC / environment)"
                            : mode === "none"
                              ? "No authentication"
                              : (settings.catalog.find(
                                  (v: any) => v.id === p.service,
                                )?.apiKeyLabel ?? "API key")}</option
                      >{/each}
                  </select></label
                >
              {/if}
              {#if p.service === "custom"}<label
                  >API protocol<select
                    value={p.protocol}
                    onchange={(e) => {
                      p.protocol = e.currentTarget.value;
                      settings = { ...settings };
                    }}
                    >{#each settings.customProtocols as protocol}<option
                        value={protocol}>{protocol}</option
                      >{/each}</select
                  ></label
                >{/if}
              <label
                >Base URL<input
                  bind:value={p.baseUrl}
                  disabled={p.authMode === "oauth"}
                  required={!p.service || p.service === "custom"}
                  type="url"
                  placeholder="Provider-managed endpoint"
                /></label
              >
              {#if p.service && p.service !== "custom"}
                <label
                  >Default model ID<select
                    aria-label="Default model ID"
                    value={p.modelId}
                    onchange={(e) => {
                      p.modelId = e.currentTarget.value;
                      settings = { ...settings };
                    }}
                    >{#each settings.catalog.find((v: any) => v.id === p.service)?.models ?? [] as model}<option
                        value={model.id}>{model.name} · {model.id}</option
                      >{/each}</select
                  ></label
                >
              {:else}<label
                  >Default model ID<input
                    bind:value={p.modelId}
                    required
                    maxlength="200"
                  /></label
                >{/if}
              {#if !p.service || p.authMode === "api_key"}
                <label
                  >API key<input
                    type="password"
                    bind:value={providerKeys[p.id]}
                    autocomplete="new-password"
                    placeholder={p.hasApiKey
                      ? "Key saved · leave blank to keep"
                      : "API key (or use guided credential setup)"}
                  /></label
                >
                <label class="check"
                  ><input
                    type="checkbox"
                    bind:checked={clearProviderKeys[p.id]}
                  />Remove saved API key</label
                >
                {#if p.service && p.service !== "custom"}<details>
                    <summary>Advanced provider configuration</summary>
                    <p class="muted">
                      Provider-scoped credential environment, such as Azure
                      resource/deployment, AWS profile/region or Cloudflare
                      account ID. Saved values stay private. Use guided setup
                      for provider-specific prompts.
                    </p>
                    <label
                      >Credential environment JSON<textarea
                        bind:value={providerEnv[p.id]}
                        placeholder={'{"AWS_REGION":"us-east-1"}'}
                      ></textarea></label
                    >
                  </details>{/if}
              {/if}
              {#if p.service && p.service !== "custom"}{#key `${p.id}:${p.service}:${p.authMode}`}<ProviderAuth
                    id={p.id}
                    mode={p.authMode}
                  />{/key}{/if}
              <button
                type="button"
                disabled={settings.providers.length === 1}
                onclick={() => {
                  settings.providers = settings.providers.filter(
                    (v: any) => v.id !== p.id,
                  );
                  if (settings.defaultProviderId === p.id)
                    settings.defaultProviderId = settings.providers[0].id;
                }}>Remove provider</button
              >
            </fieldset>
          {/each}
        </div>
        <p class="muted">
          Removing a provider takes effect on Save. Conversations using it must
          choose another provider before sending again.
        </p>
        <label
          >Default chat provider<select
            aria-label="Default chat provider"
            bind:value={settings.defaultProviderId}
            >{#each settings.providers as p}<option value={p.id}
                >{p.name}</option
              >{/each}</select
          ></label
        >
        <div class="row">
          <button
            type="button"
            onclick={() => {
              settings.providers = [
                ...settings.providers,
                {
                  id: crypto.randomUUID(),
                  name: "New provider",
                  service: "custom",
                  authMode: "api_key",
                  protocol: "openai-completions",
                  baseUrl: "http://127.0.0.1:11434/v1",
                  modelId: "local",
                  hasApiKey: false,
                },
              ];
            }}>Add provider</button
          >
          <button class="primary">Save providers</button>
        </div>
      </form>
      <form
        class="card stack"
        style="margin-top:24px"
        onsubmit={(e) => {
          e.preventDefault();
          void saveEmbedding();
        }}
      >
        <h3>Embedding endpoint</h3>
        <label
          >Embedding base URL<input
            bind:value={settings.embedding.baseUrl}
            required
            type="url"
          /></label
        >
        <label
          >Embedding model ID<input
            bind:value={settings.embedding.modelId}
            required
          /></label
        >
        <label
          >Embedding API key<input
            type="password"
            bind:value={keys.embedding}
            autocomplete="new-password"
            placeholder={settings.embedding.hasApiKey
              ? "Key saved · leave blank to keep"
              : "Optional API key"}
          /></label
        >
        <label class="check"
          ><input type="checkbox" bind:checked={clear.embedding} />Remove saved
          API key</label
        >
        <p class="muted">
          Independent OpenAI-compatible embeddings endpoint. Chat subscriptions
          and OAuth tokens are never used here. Changes require an explicit
          collection reindex.
        </p>
        <button class="primary">Save embedding settings</button>
      </form>
    {/if}
  </section>
  <section class="stack">
    <h2>Knowledge collections</h2>
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api("/api/knowledge-bases", { name });
          name = "";
          await loadCollections();
        }, "Collection created");
      }}
    >
      <label
        >Collection name<input
          bind:value={name}
          required
          placeholder="e.g. Research notes"
        /></label
      ><button class="primary">Add collection</button>
    </form>
    {#each collections as c}<article class="card stack">
        <div class="row" style="justify-content:space-between">
          <h3>{c.name}</h3>
          <span class="status"
            >{c.indexing
              ? "Indexing…"
              : c.needsReindex
                ? "Reindex required"
                : "Ready"}</span
          >
        </div>
        {#if c.needsReindex}<p class="notice">
            Embedding configuration changed. Reindex explicitly to use this
            collection.
          </p>{/if}
        <div class="row">
          <label
            >Upload document<input
              type="file"
              accept=".pdf,.md,.markdown,.txt"
              onchange={(e) => upload(c.id, e)}
            /></label
          ><button
            disabled={c.indexing}
            onclick={() => mutate(`/api/knowledge-bases/${c.id}/reindex`, {})}
            >Reindex collection</button
          ><button
            onclick={() =>
              mutate(`/api/knowledge-bases/${c.id}`, undefined, "DELETE")}
            >Delete collection</button
          >
        </div>
        <p class="muted">
          Text PDF, Markdown or plain text · up to 10 MiB · no OCR
        </p>
        {#each documents[c.id] ?? [] as d}<div
            style="border-top:1px solid #e0e7df;padding-top:15px"
          >
            <div class="row">
              <strong>{d.title}</strong><span class="status"
                >{d.status === "ready" ? "Ready · published" : d.status}</span
              >{#if d.status === "failed"}<button
                  onclick={() => mutate(`/api/documents/${d.id}/retry`, {})}
                  >Retry document</button
                >{/if}<button
                onclick={() =>
                  mutate(`/api/documents/${d.id}`, undefined, "DELETE")}
                >Delete document</button
              >
            </div>
            {#if d.error}<p class={d.status === "ready" ? "notice" : "error"}>
                {d.status === "ready"
                  ? "Rebuild warning — published content remains ready: "
                  : ""}{d.error}
              </p>{/if}
          </div>{/each}
      </article>{/each}
  </section>
  <section class="card stack">
    <h2>MCP servers</h2>
    <p class="muted">
      Select servers when creating a conversation. Selected tools may act
      without per-call approval. Credentials stay on the server.
    </p>
    {#each servers as s}<div>
        <strong>{s.id}</strong> · {s.transport}
        <p class="muted">
          {s.command ?? s.url}{s.hasHeaders || s.hasEnvironment
            ? " · secrets saved"
            : ""}
        </p>
      </div>{/each}<button onclick={() => (replace = !replace)}
      >Replace MCP configuration</button
    >{#if replace}<p class="notice">
        This replaces every server and all secrets. Existing secrets are hidden
        and cannot be copied back. Include every server and credential you want
        to keep. An empty list removes all servers.
      </p>
      <label
        >Complete MCP configuration JSON<textarea
          rows="10"
          bind:value={replacement}
          placeholder={'[{"id":"tools","transport":"http","url":"https://example.com/mcp","headers":{}}]'}
        ></textarea></label
      >
      <p class="muted">
        HTTP: id, transport, url, headers. Stdio: id, transport, command, args,
        env. Put credentials in headers or env.
      </p>
      <label class="check"
        ><input type="checkbox" bind:checked={confirm} />I intend to replace all
        servers and their secrets</label
      ><button disabled={!confirm} onclick={saveMcp}
        >Save complete replacement</button
      >{/if}
  </section>
</main>

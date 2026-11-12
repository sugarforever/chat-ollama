<script lang="ts">
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  import ProviderAuth from "$lib/ProviderAuth.svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/client";
  let settings: any;
  let tab = "providers";
  let selected = "";
  let catalogOpen = false;
  let query = "";
  let snapshot = "";
  let connection: Record<string, boolean> = {};
  async function refreshConnections() {
    if (!settings) return;
    const entries = await Promise.all(
      settings.providers
        .filter((p: any) => p.service && p.service !== "custom")
        .map(async (p: any) => {
          try {
            return [
              p.id,
              (await api(`/api/providers/${p.id}/auth`)).connected,
            ] as const;
          } catch {
            return [p.id, false] as const;
          }
        }),
    );
    connection = Object.fromEntries(entries);
  }
  const tabs = [
    {
      id: "providers",
      name: "Providers",
      description: "Chat models & accounts",
    },
    { id: "embeddings", name: "Embeddings", description: "Search & retrieval" },
    {
      id: "knowledge",
      name: "Knowledge",
      description: "Collections & documents",
    },
    { id: "tools", name: "MCP servers", description: "Tools & integrations" },
  ];
  function openProvider(id: string) {
    snapshot = JSON.stringify(settings);
    selected = id;
    notice = "";
    error = "";
  }
  function closeProvider() {
    if (selected && snapshot) settings = JSON.parse(snapshot);
    snapshot = "";
    selected = "";
    providerKeys = {};
    providerEnv = {};
    clearProviderKeys = {};
    error = "";
    void refreshConnections();
  }
  function addProvider(preset?: any, mode?: string) {
    snapshot = JSON.stringify(settings);
    const p = {
      id: crypto.randomUUID(),
      name: preset?.name ?? "New provider",
      service: preset?.id ?? "custom",
      authMode: mode ?? preset?.authModes[0] ?? "api_key",
      protocol: "openai-completions",
      baseUrl: preset?.baseUrl ?? "http://127.0.0.1:11434/v1",
      modelId: preset?.models[0]?.id ?? "local",
      hasApiKey: false,
    };
    settings.providers = [...settings.providers, p];
    selected = p.id;
    catalogOpen = false;
    query = "";
  }
  const matches = (name: string) =>
    name.toLowerCase().includes(query.toLowerCase());
  const customAuthModes = ["none", "api_key"];
  const authModes = (service: string) =>
    service === "custom"
      ? customAuthModes
      : (settings?.catalog.find((p: any) => p.id === service)?.authModes ?? []);
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
  async function persistProviders() {
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
    snapshot = JSON.stringify(settings);
    providerKeys = {};
    providerEnv = {};
    clearProviderKeys = {};
  }
  async function saveProviders() {
    await run(persistProviders, "Providers saved");
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
      await refreshConnections();
      servers = (await api("/api/mcp")).servers;
      await loadCollections();
    }, "");
    timer = setInterval(() => void loadCollections().catch(() => {}), 2000);
    return () => clearInterval(timer);
  });
</script>

<svelte:head><title>Settings · Chat Ollama</title></svelte:head>
<main class="settings settings-shell">
  <aside class="settings-nav">
    <a class="back-link" href="/">← Back to chat</a>
    <h1>Settings</h1>
    <nav aria-label="Settings categories">
      {#each tabs as item}<button
          class:active={tab === item.id}
          aria-label={item.name}
          aria-current={tab === item.id ? "page" : undefined}
          onclick={() => {
            closeProvider();
            catalogOpen = false;
            tab = item.id;
            query = "";
            notice = "";
          }}><strong>{item.name}</strong><span>{item.description}</span></button
        >{/each}
    </nav>
    <button
      class="logout"
      onclick={() =>
        run(async () => {
          await api("/api/auth/logout", {});
          location.href = "/login";
        })}>Log out</button
    >
  </aside>
  <div class="settings-content">
    <header class="settings-header">
      <span>Settings</span><span>/</span><strong
        >{tabs.find((v) => v.id === tab)?.name}</strong
      >
    </header>
    {#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p
        role="status"
        class="notice"
      >
        {notice}
      </p>{/if}
    {#if settings}
      {#if tab === "providers"}
        <section>
          {#if !selected && !catalogOpen}
            <div class="section-heading">
              <div>
                <h2>Providers</h2>
                <p class="muted">
                  Manage the models and accounts you use for chat.
                </p>
              </div>
              <button
                class="primary"
                onclick={() => {
                  catalogOpen = true;
                  query = "";
                }}>Add provider</button
              >
            </div>
            <div class="list-toolbar">
              <span class="muted">{settings.providers.length} configured</span
              ><input
                aria-label="Find a provider"
                placeholder="Find a provider…"
                bind:value={query}
              />
            </div>
            <div class="provider-list">
              {#each settings.providers.filter( (p: any) => matches(p.name), ) as p}
                <button class="provider-row" onclick={() => openProvider(p.id)}
                  ><span class="provider-mark"
                    ><ProviderLogo
                      service={p.service}
                      name={p.name}
                      baseUrl={p.baseUrl}
                    /></span
                  ><span class="provider-summary"
                    ><span class="provider-title"
                      >{p.name}
                      {#if p.id === settings.defaultProviderId}<small
                          >Default</small
                        >{/if}{#if p.authMode === "oauth"}<small
                          >Subscription</small
                        >{/if}</span
                    ><span class="muted">{p.modelId}</span></span
                  ><span class="provider-kind"
                    >{p.authMode === "oauth"
                      ? connection[p.id]
                        ? "Connected"
                        : "Not connected"
                      : p.authMode === "ambient"
                        ? "Server credentials"
                        : p.hasApiKey || connection[p.id]
                          ? "Credentials saved"
                          : p.service &&
                              p.service !== "custom" &&
                              p.authMode !== "none"
                            ? "Needs setup"
                            : "Endpoint"}</span
                  ><span aria-hidden="true">›</span></button
                >
              {:else}<p class="empty">No providers match “{query}”.</p>{/each}
            </div>
            <p class="muted list-note">
              Open a provider to manage its connection, model and credentials.
              The default applies to new conversations.
            </p>
          {:else if catalogOpen}
            <div class="section-heading">
              <div>
                <button
                  class="text-button"
                  onclick={() => {
                    catalogOpen = false;
                    query = "";
                  }}>← Providers</button
                >
                <h2>Add a provider</h2>
              </div>
              <button onclick={() => addProvider()}>+ Custom provider</button>
            </div>
            <input
              class="catalog-search"
              aria-label="Find a vendor"
              placeholder="Find a vendor…"
              bind:value={query}
            />
            {#each [{ name: "Subscriptions", description: "Sign in with your account", mode: "oauth" }, { name: "Vendors", description: "Connect with your own credentials", mode: "api_key" }] as group}
              <div class="catalog-group">
                <h3>
                  {group.name}<span class="muted">{group.description}</span>
                </h3>
                <div class="vendor-grid">
                  {#each settings.catalog.filter((p: any) => p.models.length && p.authModes.includes(group.mode) && matches(p.name)) as preset}
                    <button
                      class="vendor"
                      onclick={() => addProvider(preset, group.mode)}
                      ><span class="provider-mark"
                        ><ProviderLogo service={preset.id} /></span
                      ><span>{preset.name}</span><span class="muted">›</span
                      ></button
                    >
                  {:else}<p class="muted">No matching providers.</p>{/each}
                </div>
              </div>
            {/each}
            <div class="catalog-group">
              <h3>
                Local & custom<span class="muted"
                  >Ollama, LM Studio or a compatible endpoint</span
                >
              </h3>
              <button class="vendor" onclick={() => addProvider()}
                ><span class="provider-mark"><ProviderLogo /></span>Custom
                endpoint <span aria-hidden="true">→</span></button
              >
            </div>
          {/if}
          {#if selected}
            <form
              class="stack"
              onsubmit={(e) => {
                e.preventDefault();
                void saveProviders();
              }}
            >
              <div class="section-heading">
                <button
                  type="button"
                  class="text-button"
                  onclick={closeProvider}>← Providers</button
                ><span class="muted">Provider settings</span>
              </div>
              <p class="muted">
                Defaults apply to new conversations. Editing a selected provider
                applies to its next message. Active runs keep their captured
                configuration.
              </p>
              <div class="grid">
                {#each settings.providers.filter((p: any) => p.id === selected) as p (p.id)}
                  <fieldset
                    class="card stack"
                    aria-label={`Provider ${p.name}`}
                  >
                    <legend
                      ><span class="legend-content"
                        ><ProviderLogo
                          service={p.service}
                          name={p.name}
                          baseUrl={p.baseUrl}
                        />{p.name}</span
                      ></legend
                    >
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
                          p.service =
                            service === "legacy" ? undefined : service;
                          p.authMode = preset?.authModes[0] ?? "none";
                          p.baseUrl =
                            preset?.baseUrl ?? "http://127.0.0.1:11434/v1";
                          p.modelId = preset?.models[0]?.id ?? "local";
                          providerKeys[p.id] = "";
                          providerEnv[p.id] = "";
                          settings.providers = settings.providers.map(
                            (v: any) => (v.id === p.id ? { ...p } : v),
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
                                settings.catalog.find(
                                  (v: any) => v.id === p.service,
                                )?.baseUrl ?? "";
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
                            Provider-scoped credential environment, such as
                            Azure resource/deployment, AWS profile/region or
                            Cloudflare account ID. Saved values stay private.
                            Use guided setup for provider-specific prompts.
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
                          service={p.service}
                          beforeConnect={persistProviders}
                        />{/key}{/if}
                    <button
                      type="button"
                      disabled={settings.providers.length === 1}
                      onclick={() =>
                        run(async () => {
                          settings.providers = settings.providers.filter(
                            (v: any) => v.id !== p.id,
                          );
                          if (settings.defaultProviderId === p.id)
                            settings.defaultProviderId =
                              settings.providers[0].id;
                          try {
                            await persistProviders();
                            selected = "";
                            snapshot = "";
                          } catch (e) {
                            settings = JSON.parse(snapshot);
                            throw e;
                          }
                        }, "Provider removed")}>Remove provider</button
                    >
                  </fieldset>
                {/each}
              </div>
              <p class="muted">
                Removing a provider takes effect immediately. Conversations
                using it must choose another provider before sending again.
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
                <button type="button" onclick={closeProvider}>Cancel</button>
                <button class="primary">Save providers</button>
              </div>
            </form>
          {/if}
        </section>
      {:else if tab === "embeddings"}
        <section>
          <h2>Embeddings</h2>
          <p class="muted">
            Configure the model used to index and search your knowledge.
          </p>
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
              ><input type="checkbox" bind:checked={clear.embedding} />Remove
              saved API key</label
            >
            <p class="muted">
              Independent OpenAI-compatible embeddings endpoint. Chat
              subscriptions and OAuth tokens are never used here. Changes
              require an explicit collection reindex.
            </p>
            <button class="primary">Save embedding settings</button>
          </form>
        </section>
      {:else if tab === "knowledge"}
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
                  Embedding configuration changed. Reindex explicitly to use
                  this collection.
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
                  onclick={() =>
                    mutate(`/api/knowledge-bases/${c.id}/reindex`, {})}
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
                      >{d.status === "ready"
                        ? "Ready · published"
                        : d.status}</span
                    >{#if d.status === "failed"}<button
                        onclick={() =>
                          mutate(`/api/documents/${d.id}/retry`, {})}
                        >Retry document</button
                      >{/if}<button
                      onclick={() =>
                        mutate(`/api/documents/${d.id}`, undefined, "DELETE")}
                      >Delete document</button
                    >
                  </div>
                  {#if d.error}<p
                      class={d.status === "ready" ? "notice" : "error"}
                    >
                      {d.status === "ready"
                        ? "Rebuild warning — published content remains ready: "
                        : ""}{d.error}
                    </p>{/if}
                </div>{/each}
            </article>{/each}
        </section>
      {:else if tab === "tools"}
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
              This replaces every server and all secrets. Existing secrets are
              hidden and cannot be copied back. Include every server and
              credential you want to keep. An empty list removes all servers.
            </p>
            <label
              >Complete MCP configuration JSON<textarea
                rows="10"
                bind:value={replacement}
                placeholder={'[{"id":"tools","transport":"http","url":"https://example.com/mcp","headers":{}}]'}
              ></textarea></label
            >
            <p class="muted">
              HTTP: id, transport, url, headers. Stdio: id, transport, command,
              args, env. Put credentials in headers or env.
            </p>
            <label class="check"
              ><input type="checkbox" bind:checked={confirm} />I intend to
              replace all servers and their secrets</label
            ><button disabled={!confirm} onclick={saveMcp}
              >Save complete replacement</button
            >{/if}
        </section>
      {/if}
    {:else}<p class="muted">Loading settings…</p>{/if}
  </div>
</main>

<style>
  .settings-shell {
    max-width: none;
    padding: 0;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    min-height: 100dvh;
    background: #f7f8fa;
    color: #292c34;
  }
  .settings-nav {
    position: sticky;
    top: 0;
    height: 100dvh;
    align-self: start;
    padding: 28px 18px;
    border-right: 1px solid #e3e5e9;
    display: flex;
    flex-direction: column;
    gap: 28px;
    background: #f3f4f6;
  }
  .back-link {
    font-size: 13px;
    text-decoration: none;
    color: #616570;
  }
  .settings-nav h1 {
    font-size: 22px;
    margin: 0 10px;
  }
  nav {
    display: grid;
    gap: 6px;
  }
  nav button {
    text-align: left;
    background: transparent;
    border-color: transparent;
    display: grid;
    gap: 5px;
    padding: 12px;
  }
  nav button span {
    font-size: 12px;
    color: #686d78;
  }
  nav button.active {
    background: white;
    border-color: #e1e3e8;
    box-shadow: 0 1px 2px #00000008;
  }
  .logout {
    margin-top: auto;
    text-align: left;
    background: transparent;
    border-color: transparent;
  }
  .settings-content {
    min-width: 0;
    padding: 0 48px 48px;
    max-width: 1440px;
    width: 100%;
    margin: 0 auto;
    align-self: start;
  }
  .settings-header {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 82px;
    font-size: 14px;
    color: #6b707b;
    border-bottom: 1px solid #e6e8ec;
    margin-bottom: 32px;
  }
  .settings-header strong {
    color: #292c34;
    font-weight: 500;
  }
  .settings-content section {
    margin: 0;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }
  h2 {
    font-size: 23px;
    margin-bottom: 8px;
    letter-spacing: -0.4px;
  }
  .section-heading > button {
    white-space: nowrap;
  }
  .section-heading p {
    margin: 0;
  }
  .list-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 14px;
  }
  .list-toolbar input {
    width: 260px;
  }
  .provider-list {
    background: white;
    border: 1px solid #e1e3e8;
    border-radius: 12px;
    overflow: hidden;
  }
  .provider-row {
    display: flex;
    gap: 16px;
    width: 100%;
    text-align: left;
    align-items: center;
    border: 0;
    border-radius: 0;
    padding: 20px;
    color: inherit;
  }
  .provider-row + .provider-row {
    border-top: 1px solid #eceef1;
  }
  .provider-row:hover,
  .vendor:hover {
    background: #f1f3f6;
  }
  .legend-content {
    display: inline-flex;
    gap: 10px;
    align-items: center;
  }
  .provider-mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #555c6a;
    font-size: 12px;
    font-weight: 650;
  }
  .provider-summary {
    display: grid;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .provider-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-weight: 550;
  }
  .provider-summary .muted {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: 10px;
    color: #626978;
    background: #eff1f5;
    border-radius: 4px;
    padding: 2px 5px;
    font-weight: 500;
  }
  .provider-kind {
    font-size: 12px;
    color: #686d78;
    margin-right: 12px;
  }
  .list-note {
    margin-top: 18px;
    line-height: 1.6;
  }
  .text-button {
    border: 0;
    background: transparent;
    padding: 0;
    color: #626978;
  }
  .catalog-search {
    width: 100%;
    max-width: 420px;
    margin-bottom: 28px;
  }
  .catalog-group {
    margin: 10px 0 36px;
  }
  .catalog-group h3 {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }
  .catalog-group h3 span {
    font-weight: 400;
  }
  .vendor-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 20px;
  }
  .vendor {
    border: 0;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    text-align: left;
    color: inherit;
  }
  .vendor span:nth-child(2) {
    flex: 1;
  }
  .empty {
    padding: 24px;
    margin: 0;
  }
  .settings-content .grid {
    grid-template-columns: minmax(0, 1fr);
    max-width: 720px;
  }
  .settings-content :global(fieldset.card) {
    background: white;
    border-color: #e1e3e8;
    padding: 24px;
  }
  .settings-content :global(legend) {
    padding: 0 8px;
    font-weight: 600;
  }
  .settings-content .stack {
    max-width: 860px;
  }
  .settings-content .muted {
    color: #676e7b;
  }
  @media (max-width: 1000px) {
    .settings-content {
      padding: 0 24px 32px;
    }
    .vendor-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .settings-shell {
      grid-template-columns: 200px minmax(0, 1fr);
    }
  }
  @media (max-width: 640px) {
    .settings-shell {
      display: block;
    }
    .settings-nav {
      padding: 16px;
      gap: 16px;
      border-right: 0;
      border-bottom: 1px solid #e3e5e9;
    }
    .settings-nav h1 {
      display: none;
    }
    .settings-nav nav {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      overflow: visible;
      gap: 4px;
    }
    .settings-nav nav button {
      white-space: nowrap;
      padding: 10px;
    }
    .settings-nav nav span {
      display: none;
    }
    .settings-nav {
      position: relative;
      height: auto;
    }
    .logout {
      position: absolute;
      top: 8px;
      right: 16px;
      margin: 0;
      padding: 8px;
      font-size: 13px;
    }
    .settings-content {
      padding: 0 16px 32px;
    }
    .settings-header {
      min-height: 60px;
      margin-bottom: 24px;
    }
    .section-heading {
      align-items: flex-start;
      gap: 12px;
    }
    .section-heading h2 {
      font-size: 20px;
    }
    .list-toolbar input {
      width: 200px;
    }
    .provider-kind {
      display: block;
      font-size: 11px;
      max-width: 76px;
      margin-right: 0;
    }
    .provider-row {
      padding: 16px 12px;
      gap: 10px;
    }
    .vendor-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .catalog-group h3 {
      flex-wrap: wrap;
      gap: 6px;
    }
    .settings-content :global(fieldset.card) {
      padding: 16px;
      min-width: 0;
    }
  }
</style>

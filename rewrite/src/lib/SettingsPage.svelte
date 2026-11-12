<script lang="ts">
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { ArrowLeft, Plus, Trash2, Save, X } from "@lucide/svelte";
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  import ProviderAuth from "$lib/ProviderAuth.svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/client";
  let settings: any;
  export let tab = "providers";
  export let editorId = "";
  export let newService = "";
  export let newAuth = "";
  export let draftId = "";
  export let saved = false;
  let creatingConnection = false;
  let allowNavigation = false;
  let discardOpen = false;
  let removeOpen = false;
  let pendingNavigation: (() => void) | undefined;
  export function capture() {
    return { query };
  }
  export function restore(state: { query?: string }) {
    query = state?.query ?? "";
  }
  function isDirty() {
    if (!settings || !snapshot) return false;
    const initial = JSON.parse(snapshot);
    if (selected)
      return (
        JSON.stringify(
          settings.providers.find((p: any) => p.id === selected),
        ) !==
          JSON.stringify(
            initial.providers.find((p: any) => p.id === selected),
          ) ||
        !!providerKeys[selected] ||
        !!providerEnv[selected] ||
        !!clearProviderKeys[selected]
      );
    if (tab === "chat")
      return settings.defaultProviderId !== initial.defaultProviderId;
    if (tab === "embeddings")
      return (
        JSON.stringify(settings.embedding) !==
          JSON.stringify(initial.embedding) ||
        !!keys.embedding ||
        clear.embedding
      );
    if (tab === "tools") return replace && (replacement !== "[]" || confirm);
    return false;
  }
  beforeNavigate((navigation) => {
    if (allowNavigation || !isDirty()) return;
    navigation.cancel();
    if (navigation.willUnload) return;
    const target = navigation.to?.url;
    if (!target) return;
    pendingNavigation =
      navigation.type === "popstate" && navigation.delta
        ? () => history.go(navigation.delta!)
        : () => {
            void goto(target);
          };
    discardOpen = true;
  });
  function discardChanges() {
    allowNavigation = true;
    discardOpen = false;
    const go = pendingNavigation;
    pendingNavigation = undefined;
    go?.();
  }
  const providerHref = (id: string) =>
    `/settings/providers/${encodeURIComponent(id)}`;
  function newProviderHref(service = "custom", mode = "api_key") {
    return `/settings/providers/new/${encodeURIComponent(service)}?${new URLSearchParams({ auth: mode, draft: crypto.randomUUID() })}`;
  }
  let selected = "";
  export let catalogOpen = false;
  let query = "";
  let snapshot = "";
  let connection: Record<string, boolean> = {};
  let connectionRead = 0;
  let connectionsActive = true;
  let connectionsLoading = false;
  let connectionsQueued = false;
  function syncConnection(id: string, connected: boolean) {
    if (connected && newService && !creatingConnection && selected)
      void goto(providerHref(selected), { replaceState: true });
    if (connection[id] === connected) return;
    connectionRead++;
    connection = { ...connection, [id]: connected };
  }
  async function refreshConnections() {
    if (!settings || !connectionsActive) return;
    if (connectionsLoading) {
      connectionsQueued = true;
      return;
    }
    connectionsLoading = true;
    const read = ++connectionRead;
    try {
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
              return [p.id, connection[p.id] ?? false] as const;
            }
          }),
      );
      if (connectionsActive && read === connectionRead)
        connection = Object.fromEntries(entries);
    } finally {
      connectionsLoading = false;
      if (connectionsQueued && connectionsActive) {
        connectionsQueued = false;
        void refreshConnections();
      }
    }
  }
  const tabs = [
    {
      id: "providers",
      name: "Providers",
      description: "Chat models & accounts",
    },
    {
      id: "chat",
      name: "Chat defaults",
      description: "New conversation defaults",
    },
    { id: "embeddings", name: "Embeddings", description: "Search & retrieval" },
    {
      id: "knowledge",
      name: "Knowledge",
      description: "Collections & documents",
    },
    { id: "tools", name: "MCP servers", description: "Tools & integrations" },
  ];
  function initializeEditor() {
    if (editorId) {
      selected = editorId;
    }
    if (newService) {
      const existing = settings.providers.find((p: any) => p.id === draftId);
      if (existing) selected = existing.id;
      else {
        const preset = settings.catalog.find((p: any) => p.id === newService);
        const p = {
          id: draftId,
          name: preset?.name ?? "New provider",
          service: newService,
          authMode: newAuth || preset?.authModes[0] || "api_key",
          protocol: "openai-completions",
          baseUrl: preset?.baseUrl ?? "http://127.0.0.1:11434/v1",
          modelId: preset?.models[0]?.id ?? "local",
          hasApiKey: false,
        };
        settings.providers = [...settings.providers, p];
        selected = p.id;
        creatingConnection = true;
      }
    }
    snapshot = JSON.stringify(settings);
  }
  function closeProvider() {
    void goto("/settings/providers");
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
  function providerPatch(p: any) {
    return {
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      modelId: p.modelId,
      ...(p.service
        ? { service: p.service, authMode: p.authMode, protocol: p.protocol }
        : {}),
    };
  }
  async function persistProviders() {
    const p = settings.providers.find((p: any) => p.id === selected);
    const latest = await api("/api/settings");
    if (
      !creatingConnection &&
      !latest.providers.some((v: any) => v.id === p.id)
    )
      throw Error(
        "This connection was removed in another tab. Return to Providers.",
      );
    const patch = {
      ...providerPatch(p),
      ...(providerEnv[p.id]
        ? { credentialEnv: JSON.parse(providerEnv[p.id]) }
        : {}),
      ...(clearProviderKeys[p.id]
        ? { apiKey: "" }
        : providerKeys[p.id]
          ? { apiKey: providerKeys[p.id] }
          : {}),
    };
    const providers = latest.providers
      .filter((v: any) => v.id !== p.id)
      .map(providerPatch);
    const index = latest.providers.findIndex((v: any) => v.id === p.id);
    providers.splice(index < 0 ? providers.length : index, 0, patch);
    settings = await api("/api/settings", { providers });
    creatingConnection = false;
    snapshot = JSON.stringify(settings);
    providerKeys = {};
    providerEnv = {};
    clearProviderKeys = {};
  }
  async function saveProviders() {
    const wasNew = creatingConnection;
    await run(async () => {
      await persistProviders();
      if (wasNew)
        await goto(`${providerHref(selected)}?saved=1`, { replaceState: true });
    }, "Provider saved");
  }
  async function saveDefaults() {
    await run(async () => {
      settings = await api("/api/settings", {
        defaultProviderId: settings.defaultProviderId,
      });
      snapshot = JSON.stringify(settings);
    }, "Chat defaults saved");
  }
  async function removeProvider() {
    await run(async () => {
      const latest = await api("/api/settings");
      const remaining = latest.providers.filter((p: any) => p.id !== selected);
      if (!remaining.length)
        throw Error("Keep at least one provider configuration.");
      await api("/api/settings", {
        providers: remaining.map(providerPatch),
        defaultProviderId:
          latest.defaultProviderId === selected
            ? remaining[0].id
            : latest.defaultProviderId,
      });
      allowNavigation = true;
      await goto("/settings/providers", { replaceState: true });
    }, "Provider removed");
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
      snapshot = JSON.stringify(settings);
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
    void run(
      async () => {
        settings = await api("/api/settings");
        initializeEditor();
        if (saved) notice = "Provider saved";
        await refreshConnections();
        servers = (await api("/api/mcp")).servers;
        await loadCollections();
      },
      saved ? "Provider saved" : "",
    );
    const sync = () => {
      if (document.visibilityState === "visible") void refreshConnections();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    timer = setInterval(() => {
      void loadCollections().catch(() => {});
      void refreshConnections();
    }, 2000);
    return () => {
      connectionsActive = false;
      connectionRead++;
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  });
</script>

<svelte:head><title>Settings · Chat Ollama</title></svelte:head>
<main class="settings settings-shell">
  <aside class="settings-nav">
    <a class="back-link" href="/">← Back to chat</a>
    <h1>Settings</h1>
    <nav aria-label="Settings categories">
      {#each tabs as item}<a
          class:active={tab === item.id}
          aria-label={item.name}
          aria-current={tab === item.id ? "page" : undefined}
          href={`/settings/${item.id}`}
          ><strong>{item.name}</strong><span>{item.description}</span></a
        >{/each}
    </nav>
    <button
      class="logout"
      onclick={() => {
        const logout = () => void run(async () => {
          await api("/api/auth/logout", {});
          allowNavigation = true;
          location.href = "/login";
        });
        if (isDirty()) {
          pendingNavigation = logout;
          discardOpen = true;
        } else logout();
      }}>Log out</button
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
                  Your saved connections. Browse the catalog to add a built-in
                  provider.
                </p>
              </div>
              <Button href="/settings/providers/new"
                ><Plus />Add provider</Button
              >
            </div>
            <div class="list-toolbar">
              <span class="muted">{settings.providers.length} saved</span><Input
                aria-label="Find a provider"
                placeholder="Find a provider…"
                bind:value={query}
              />
            </div>
            <div class="provider-list">
              {#each settings.providers.filter( (p: any) => matches(p.name), ) as p}
                <a class="provider-row" href={providerHref(p.id)}
                  ><span class="provider-mark"
                    ><ProviderLogo
                      service={p.service}
                      name={p.name}
                      baseUrl={p.baseUrl}
                    /></span
                  ><span class="provider-summary"
                    ><span class="provider-title"
                      >{p.name}
                      {#if p.id === settings.defaultProviderId}<Badge
                          variant="secondary">Default</Badge
                        >{/if}{#if p.authMode === "oauth"}<Badge
                          variant="secondary">Subscription</Badge
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
                  ><span aria-hidden="true">›</span></a
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
                <Button
                  href="/settings/providers"
                  variant="ghost"
                  size="icon"
                  aria-label="Back to providers"
                  title="Back to providers"><ArrowLeft /></Button
                >
                <h2>Add a provider</h2>
                <p class="muted">
                  Choose a built-in service, then configure your own connection.
                </p>
              </div>
              <Button variant="outline" href={newProviderHref()}
                ><Plus />Custom provider</Button
              >
            </div>
            <Input
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
                    <a
                      class="vendor"
                      href={newProviderHref(preset.id, group.mode)}
                      ><span class="provider-mark"
                        ><ProviderLogo service={preset.id} /></span
                      ><span>{preset.name}</span><span class="muted">›</span></a
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
              <a class="vendor" href={newProviderHref()}
                ><span class="provider-mark"><ProviderLogo /></span>Custom
                endpoint <span aria-hidden="true">→</span></a
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
                <Button
                  href="/settings/providers"
                  variant="ghost"
                  size="icon"
                  aria-label="Back to providers"
                  title="Back to providers"><ArrowLeft /></Button
                ><span class="muted">Provider settings</span>
              </div>
              <p class="muted">
                Manage this connection’s endpoint, model and credentials.
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
                      >Provider name<Input
                        bind:value={p.name}
                        required
                        maxlength={100}
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
                      >Base URL<Input
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
                              value={model.id}>{model.id}</option
                            >{/each}</select
                        ></label
                      >
                    {:else}<label
                        >Default model ID<Input
                          bind:value={p.modelId}
                          required
                          maxlength={200}
                        /></label
                      >{/if}
                    {#if !p.service || p.authMode === "api_key"}
                      <label
                        >API key<Input
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
                          onStatus={(connected) =>
                            syncConnection(p.id, connected)}
                        />{/key}{/if}
                    {#if !creatingConnection}<Button
                        variant="destructive"
                        size="icon"
                        aria-label="Remove provider"
                        title="Remove provider"
                        disabled={settings.providers.length === 1}
                        onclick={() => (removeOpen = true)}><Trash2 /></Button
                      >{/if}
                  </fieldset>
                {/each}
              </div>
              <div class="row">
                <Button
                  href="/settings/providers"
                  variant="outline"
                  size="icon"
                  aria-label="Cancel"
                  title="Cancel"><X /></Button
                >
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Save provider"
                  title="Save provider"><Save /></Button
                >
              </div>
            </form>
          {/if}
        </section>
      {:else if tab === "chat"}
        <section>
          <h2>Chat defaults</h2>
          <p class="muted">
            Choose the provider used when starting a new conversation. Existing
            conversations keep their selection.
          </p>
          <form
            class="card stack"
            onsubmit={(e) => {
              e.preventDefault();
              void saveDefaults();
            }}
          >
            <label
              >Default chat provider<select
                aria-label="Default chat provider"
                bind:value={settings.defaultProviderId}
                >{#each settings.providers as p}<option value={p.id}
                    >{p.name}</option
                  >{/each}</select
              ></label
            ><Button type="submit"><Save />Save chat defaults</Button>
          </form>
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
              >Embedding base URL<Input
                bind:value={settings.embedding.baseUrl}
                required
                type="url"
              /></label
            >
            <label
              >Embedding model ID<Input
                bind:value={settings.embedding.modelId}
                required
              /></label
            >
            <label
              >Embedding API key<Input
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
              >Collection name<Input
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

<AlertDialog.Root bind:open={discardOpen}>
  <AlertDialog.Content
    ><AlertDialog.Header
      ><AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title
      ><AlertDialog.Description
        >Your edits have not been saved. Stay here to keep editing, or discard
        them and continue.</AlertDialog.Description
      ></AlertDialog.Header
    ><AlertDialog.Footer
      ><AlertDialog.Cancel onclick={() => (pendingNavigation = undefined)}
        >Keep editing</AlertDialog.Cancel
      ><AlertDialog.Action onclick={discardChanges}
        >Discard changes</AlertDialog.Action
      ></AlertDialog.Footer
    ></AlertDialog.Content
  >
</AlertDialog.Root>
<AlertDialog.Root bind:open={removeOpen}>
  <AlertDialog.Content
    ><AlertDialog.Header
      ><AlertDialog.Title>Remove this provider?</AlertDialog.Title
      ><AlertDialog.Description
        >This removes the saved connection, not conversation history.
        Conversations using it must choose another provider before sending
        again.</AlertDialog.Description
      ></AlertDialog.Header
    ><AlertDialog.Footer
      ><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action
        onclick={() => void removeProvider()}
        >Remove provider</AlertDialog.Action
      ></AlertDialog.Footer
    ></AlertDialog.Content
  >
</AlertDialog.Root>

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
  nav a {
    text-decoration: none;
    color: inherit;
    border: 1px solid transparent;
    border-radius: 8px;
    text-align: left;
    background: transparent;
    border-color: transparent;
    display: grid;
    gap: 5px;
    padding: 12px;
  }
  nav a span {
    font-size: 12px;
    color: #686d78;
  }
  nav a.active {
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
  .section-heading > :global([data-slot="button"]) {
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
  .list-toolbar :global(input) {
    width: 260px;
  }
  .provider-list {
    background: white;
    border: 1px solid #e1e3e8;
    border-radius: 12px;
    overflow: hidden;
  }
  .provider-row {
    text-decoration: none;
    background: white;
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

  .provider-kind {
    font-size: 12px;
    color: #686d78;
    margin-right: 12px;
  }
  .list-note {
    margin-top: 18px;
    line-height: 1.6;
  }

  :global(.catalog-search) {
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
    text-decoration: none;
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
    .settings-nav nav a {
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
    .list-toolbar :global(input) {
      width: 200px;
    }
    .provider-kind {
      display: block;
      font-size: 11px;
      max-width: 76px;
      margin-right: 0;
    }
    .provider-row {
      text-decoration: none;
      background: white;
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

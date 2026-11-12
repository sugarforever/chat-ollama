<script lang="ts">
  import NativeSelect from "$lib/components/ui/native-select/native-select.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { ArrowLeft, Plus, Trash2, Save, CheckCircle2, LoaderCircle, RotateCw } from "@lucide/svelte";
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
  const editableProvider = (p: any) => p ? (({ models, ...value }) => value)(p) : p;
  function isDirty() {
    if (!settings || !snapshot) return false;
    const initial = JSON.parse(snapshot);
    if (selected)
      return (
        JSON.stringify(
          editableProvider(settings.providers.find((p: any) => p.id === selected)),
        ) !==
          JSON.stringify(
            editableProvider(initial.providers.find((p: any) => p.id === selected)),
          ) ||
        !!providerKeys[selected] ||
        !!providerEnv[selected]
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
  let discoveryState = "idle";
  let discoveryError = "";
  let modelOptions: string[] = [];
  let discoverySignature = "";
  let discoveryTimer: ReturnType<typeof setTimeout>;
  let discoveryAbort: AbortController | undefined;
  let discoveryGeneration = 0;
  function usesDiscovery(p: any) {
    return p && p.authMode !== "oauth" && p.authMode !== "ambient" && (!p.service || p.service === "custom" || settings?.catalog.find((v: any) => v.id === p.service)?.apiSetup);
  }
  function scheduleDiscovery(p: any, key: string) {
    const signature = JSON.stringify([p?.id, p?.service, p?.baseUrl, p?.authMode, key]);
    if (signature === discoverySignature) return;
    discoverySignature = signature;
    clearTimeout(discoveryTimer);
    discoveryAbort?.abort();
    const generation = ++discoveryGeneration;
    modelOptions = [];
    discoveryError = "";
    discoveryState = "idle";
    if (key.trim()) providerSaveState = "idle";
    if (!usesDiscovery(p) || (!key.trim() && !p.hasApiKey && p.authMode !== "none" && p.service)) return;
    discoveryState = "loading";
    discoveryTimer = setTimeout(async () => {
      discoveryAbort = new AbortController();
      try {
        const response = await fetch("/api/providers/models", {
          method: "POST", headers: { "content-type": "application/json" }, signal: discoveryAbort.signal,
          body: JSON.stringify({ id: creatingConnection ? undefined : p.id, service: p.service ?? "custom", baseUrl: p.baseUrl, authMode: p.authMode ?? (p.hasApiKey || key ? "api_key" : "none"), protocol: p.protocol, apiKey: key }),
        });
        const result = await response.json();
        if (generation !== discoveryGeneration) return;
        if (!response.ok) throw Error(result.error?.message ?? "Connection failed. Check your API key.");
        modelOptions = result.models;
        const target = settings.providers.find((v: any) => v.id === p.id);
        if (!target) return;
        target.models = result.models;
        if (creatingConnection || !modelOptions.includes(target.modelId)) target.modelId = result.defaultModelId;
        settings = { ...settings };
        discoveryState = "success";
      } catch (e) {
        if (generation !== discoveryGeneration) return;
        discoveryState = "error";
        discoveryError = (e as Error).message;
      }
    }, 600);
  }
  $: if (settings && selected) scheduleDiscovery(settings.providers.find((p: any) => p.id === selected), providerKeys[selected] ?? "");
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
      ...(p.models ? { models: p.models } : {}),
      ...(p.service
        ? { service: p.service, authMode: p.authMode, protocol: p.protocol }
        : {}),
    };
  }
  async function persistProviders() {
    const p = { ...settings.providers.find((p: any) => p.id === selected) };
    const submittedKey = providerKeys[p.id];
    const submittedEnv = providerEnv[p.id];
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
      ...(submittedEnv
        ? { credentialEnv: JSON.parse(submittedEnv) }
        : {}),
      ...(submittedKey ? { apiKey: submittedKey } : {}),
    };
    const providers = latest.providers
      .filter((v: any) => v.id !== p.id)
      .map(providerPatch);
    const index = latest.providers.findIndex((v: any) => v.id === p.id);
    providers.splice(index < 0 ? providers.length : index, 0, patch);
    const result = await api("/api/settings", { providers });
    const current = settings.providers.find((v: any) => v.id === p.id);
    snapshot = JSON.stringify(result);
    const changed = JSON.stringify(current) !== JSON.stringify(p);
    settings = changed ? { ...result, providers: result.providers.map((v: any) => v.id === p.id ? { ...v, ...current, hasApiKey: v.hasApiKey } : v) } : result;
    creatingConnection = false;
    if (providerKeys[p.id] === submittedKey) providerKeys = { ...providerKeys, [p.id]: "" };
    if (providerEnv[p.id] === submittedEnv) providerEnv = { ...providerEnv, [p.id]: "" };
  }
  let providerSaving = false;
  let providerSaveQueued = false;
  let providerSaveState = "idle";
  let providerSaveAttempt = "";
  function autoSaveProvider() {
    const p = settings?.providers.find((v: any) => v.id === selected);
    if (!p || tab !== "providers" || (!isDirty() && !(creatingConnection && (!usesDiscovery(p) || discoveryState === "success")))) return;
    if (usesDiscovery(p) && discoveryState !== "success") return;
    const signature = JSON.stringify([p, providerKeys[p.id], providerEnv[p.id]]);
    if (signature === providerSaveAttempt) return;
    if (providerSaving) { providerSaveQueued = true; return; }
    providerSaveAttempt = signature;
    providerSaving = true;
    providerSaveState = "saving";
    error = "";
    void persistProviders().then(() => {
      providerSaveState = "saved";
    }).catch((e) => {
      providerSaveState = "error";
      error = (e as Error).message;
    }).finally(() => {
      providerSaving = false;
      if (providerSaveQueued) {
        providerSaveQueued = false;
        autoSaveProvider();
      }
    });
  }
  $: if (settings && selected && snapshot && providerKeys && providerEnv && discoveryState) autoSaveProvider();
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
      clearTimeout(discoveryTimer);
      discoveryAbort?.abort();
      discoveryGeneration++;
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
    <Button variant="outline"
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
      }}>Log out</Button
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
            {#each [{ name: "Subscriptions", description: "Sign in with your account", mode: "oauth" }, { name: "API providers", description: "Connect with an API key", mode: "api_key" }] as group}
              <div class="catalog-group">
                <h3>
                  {group.name}<span class="muted">{group.description}</span>
                </h3>
                <div class="vendor-grid">
                  {#each settings.catalog.filter((p: any) => p.models.length && (group.mode === "oauth" ? ["openai-codex", "anthropic"].includes(p.id) : p.apiSetup) && p.authModes.includes(group.mode) && matches(p.name + (p.id === "anthropic" ? " Claude" : p.id === "openai-codex" ? " ChatGPT" : ""))) as preset}
                    <a
                      class="vendor"
                      href={newProviderHref(preset.id, group.mode)}
                      ><span class="provider-mark"
                        ><ProviderLogo service={preset.id} /></span
                      ><span>{group.mode === "oauth" ? (preset.id === "openai-codex" ? "ChatGPT (Codex)" : "Claude") : preset.name}</span><span class="muted">›</span></a
                    >
                  {:else}<p class="muted">No matching providers.</p>{/each}
                </div>
              </div>
            {/each}
          {/if}
          {#if selected}
            <form
              class="stack"
              onsubmit={(e) => {
                e.preventDefault();
                autoSaveProvider();
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
                {creatingConnection ? "Set up this connection’s endpoint, model and credentials." : "Update this connection’s model and API key."}
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
                    {#if creatingConnection && p.service === "custom"}
                      <label>Provider name<Input bind:value={p.name} required maxlength={100} /></label>
                      <label>Base URL<Input bind:value={p.baseUrl} required type="url" /></label>
                      <label>Authentication<NativeSelect class="w-full" aria-label="Authentication" bind:value={p.authMode}><option value="api_key">API key</option><option value="none">No authentication (local endpoint)</option></NativeSelect></label>
                    {:else}
                      <dl class="connection-details">
                        {#if !creatingConnection || p.authMode === "oauth"}<div><dt>Model service</dt><dd>{settings.catalog.find((v: any) => v.id === p.service)?.name ?? "Custom endpoint"}</dd></div>
                        <div><dt>Authentication</dt><dd>{p.authMode === "oauth" ? "Account login / OAuth" : p.authMode === "ambient" ? "Server credentials" : p.authMode === "none" ? "No authentication" : "API key"}</dd></div>{/if}
                        <div><dt>Base URL</dt><dd>{p.baseUrl || "Provider-managed endpoint"}</dd></div>
                      </dl>
                    {/if}
                    {#if !usesDiscovery(p)}
                      <label>Default model ID<NativeSelect class="w-full" aria-label="Default model ID" bind:value={p.modelId}>
                        {#each settings.catalog.find((v: any) => v.id === p.service)?.models ?? [] as model}<option value={model.id}>{model.id}</option>{/each}
                      </NativeSelect></label>
                    {/if}
                    {#if !p.service || p.authMode === "api_key"}
                      <label
                        >API key<Input
                          type="password"
                          bind:value={providerKeys[p.id]}
                          autocomplete="new-password"
                          placeholder={p.hasApiKey
                            ? "Key saved · leave blank to keep"
                            : "Enter API key"}
                        /></label
                      >
                    {/if}
                    {#if usesDiscovery(p)}
                      {#if discoveryState === "loading"}<p class="discovery-message" aria-live="polite"><LoaderCircle size={16} class="animate-spin" />Testing connection and loading models…</p>
                      {:else if discoveryState === "error"}<div class="discovery-message"><p class="error" role="alert">{discoveryError}</p><Button variant="ghost" size="icon" aria-label="Retry connection" title="Retry connection" onclick={() => { discoverySignature = ""; scheduleDiscovery(p, providerKeys[p.id] ?? ""); }}><RotateCw /></Button></div>
                      {:else if discoveryState === "success"}<p class="discovery-message" aria-live="polite"><CheckCircle2 size={16} />Connection verified · {modelOptions.length} models</p>
                      {:else}<p class="muted">Enter your API key to connect and load available models.</p>{/if}
                      {#if discoveryState === "success"}<label>Default model ID<NativeSelect class="w-full" aria-label="Default model ID" bind:value={p.modelId}>{#each modelOptions as id}<option value={id}>{id}</option>{/each}</NativeSelect></label>{/if}
                    {/if}
                    {#if p.service && p.service !== "custom" && !usesDiscovery(p)}{#key `${p.id}:${p.service}:${p.authMode}`}<ProviderAuth
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
              <p class="discovery-message" role="status" aria-live="polite" title="Changes save automatically. API keys save only after the connection test succeeds.">
                {#if providerSaveState === "saving"}<LoaderCircle size={16} class="animate-spin" />Saving…
                {:else if providerSaveState === "saved"}<CheckCircle2 size={16} class="saved-check" />Saved automatically
                {:else if providerSaveState === "error"}Changes couldn’t be saved.<Button variant="ghost" size="icon" aria-label="Retry saving" title="Retry saving" onclick={() => { providerSaveAttempt = ""; autoSaveProvider(); }}><RotateCw /></Button>
                {:else}Changes save automatically. API keys save after verification.{/if}
              </p>
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
              >Default chat provider<NativeSelect class="w-full"
                aria-label="Default chat provider"
                bind:value={settings.defaultProviderId}
                >{#each settings.providers as p}<option value={p.id}
                    >{p.name}</option
                  >{/each}</NativeSelect
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
              ><Checkbox bind:checked={clear.embedding} />Remove
              saved API key</label
            >
            <p class="muted">
              Independent OpenAI-compatible embeddings endpoint. Chat
              subscriptions and OAuth tokens are never used here. Changes
              require an explicit collection reindex.
            </p>
            <Button type="submit" variant="default">Save embedding settings</Button>
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
            ><Button type="submit" variant="default">Add collection</Button>
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
                  >Upload document<Input
                    type="file"
                    accept=".pdf,.md,.markdown,.txt"
                    onchange={(e) => upload(c.id, e)}
                  /></label
                ><Button variant="outline"
                  disabled={c.indexing}
                  onclick={() =>
                    mutate(`/api/knowledge-bases/${c.id}/reindex`, {})}
                  >Reindex collection</Button
                ><Button variant="outline"
                  onclick={() =>
                    mutate(`/api/knowledge-bases/${c.id}`, undefined, "DELETE")}
                  >Delete collection</Button
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
                    >{#if d.status === "failed"}<Button variant="outline"
                        onclick={() =>
                          mutate(`/api/documents/${d.id}/retry`, {})}
                        >Retry document</Button
                      >{/if}<Button variant="outline"
                      onclick={() =>
                        mutate(`/api/documents/${d.id}`, undefined, "DELETE")}
                      >Delete document</Button
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
            </div>{/each}<Button variant="outline" onclick={() => (replace = !replace)}
            >Replace MCP configuration</Button
          >{#if replace}<p class="notice">
              This replaces every server and all secrets. Existing secrets are
              hidden and cannot be copied back. Include every server and
              credential you want to keep. An empty list removes all servers.
            </p>
            <label
              >Complete MCP configuration JSON<Textarea
                rows={10}
                bind:value={replacement}
                placeholder={'[{"id":"tools","transport":"http","url":"https://example.com/mcp","headers":{}}]'}
              ></Textarea></label
            >
            <p class="muted">
              HTTP: id, transport, url, headers. Stdio: id, transport, command,
              args, env. Put credentials in headers or env.
            </p>
            <label class="check"
              ><Checkbox bind:checked={confirm} />I intend to
              replace all servers and their secrets</label
            ><Button variant="outline" disabled={!confirm} onclick={saveMcp}
              >Save complete replacement</Button
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
  :global(.saved-check) { animation: saved-pop 240ms ease-out; }
  @keyframes saved-pop { from { opacity: 0; transform: scale(.65); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { :global(.saved-check) { animation: none; } }

  .discovery-message { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .discovery-message p { margin: 0; }
  .connection-details { display: grid; gap: 16px; margin: 0; }
  .connection-details div { display: grid; gap: 4px; }
  .connection-details dt { color: var(--muted); font-size: 12px; }
  .connection-details dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }

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
  .settings-nav :global(.logout) {
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
    .settings-nav :global(.logout) {
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

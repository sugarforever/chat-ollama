<script lang="ts">
  import Skills from "$lib/components/Skills.svelte";
  import KnowledgeCollections from "$lib/components/KnowledgeCollections.svelte";
  import SettingsNavigation from "$lib/components/shell/SettingsNavigation.svelte";
  import SaveIndicator from "$lib/components/common/SaveIndicator.svelte";
  import NativeSelect from "$lib/components/ui/native-select/native-select.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import {
    ArrowLeft,
    Plus,
    Trash2,
    CheckCircle2,
    LoaderCircle,
    RotateCw,
  } from "@lucide/svelte";
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
  const editableProvider = (p: any) =>
    p ? (({ models, ...value }) => value)(p) : p;
  function isDirty() {
    if (!settings || !snapshot) return false;
    const initial = JSON.parse(snapshot);
    if (selected)
      return (
        JSON.stringify(
          editableProvider(
            settings.providers.find((p: any) => p.id === selected),
          ),
        ) !==
          JSON.stringify(
            editableProvider(
              initial.providers.find((p: any) => p.id === selected),
            ),
          ) ||
        !!providerKeys[selected] ||
        !!providerEnv[selected]
      );
    if (tab === "providers" && !selected && !catalogOpen)
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
    return (
      p &&
      p.authMode !== "oauth" &&
      p.authMode !== "ambient" &&
      (!p.service ||
        p.service === "custom" ||
        settings?.catalog.find((v: any) => v.id === p.service)?.apiSetup)
    );
  }
  function scheduleDiscovery(p: any, key: string) {
    const signature = JSON.stringify([
      p?.id,
      p?.service,
      p?.baseUrl,
      p?.authMode,
      p?.protocol,
      key,
    ]);
    if (signature === discoverySignature) return;
    discoverySignature = signature;
    clearTimeout(discoveryTimer);
    discoveryAbort?.abort();
    const generation = ++discoveryGeneration;
    modelOptions = [];
    discoveryError = "";
    discoveryState = "idle";
    if (key.trim()) providerSaveState = "idle";
    if (
      !usesDiscovery(p) ||
      (!key.trim() && !p.hasApiKey && p.authMode !== "none" && p.service)
    )
      return;
    discoveryState = "loading";
    discoveryTimer = setTimeout(async () => {
      discoveryAbort = new AbortController();
      try {
        const response = await fetch("/api/providers/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: discoveryAbort.signal,
          body: JSON.stringify({
            id: creatingConnection ? undefined : p.id,
            service: p.service ?? "custom",
            baseUrl: p.baseUrl,
            authMode: p.authMode ?? (p.hasApiKey || key ? "api_key" : "none"),
            protocol: p.protocol,
            apiKey: key,
          }),
        });
        const result = await response.json();
        if (generation !== discoveryGeneration) return;
        if (!response.ok)
          throw Error(
            result.error?.message ?? "Connection failed. Check your API key.",
          );
        modelOptions = result.models;
        const target = settings.providers.find((v: any) => v.id === p.id);
        if (!target) return;
        target.models = result.models;
        if (creatingConnection || !modelOptions.includes(target.modelId))
          target.modelId = result.defaultModelId;
        settings = { ...settings };
        discoveryState = "success";
      } catch (e) {
        if (generation !== discoveryGeneration) return;
        discoveryState = "error";
        discoveryError = (e as Error).message;
      }
    }, 600);
  }
  $: if (settings && selected)
    scheduleDiscovery(
      settings.providers.find((p: any) => p.id === selected),
      providerKeys[selected] ?? "",
    );
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
      return true;
    } catch (e) {
      error = (e as Error).message;
      return false;
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
      ...(submittedEnv ? { credentialEnv: JSON.parse(submittedEnv) } : {}),
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
    settings = changed
      ? {
          ...result,
          providers: result.providers.map((v: any) =>
            v.id === p.id ? { ...v, ...current, hasApiKey: v.hasApiKey } : v,
          ),
        }
      : result;
    creatingConnection = false;
    if (providerKeys[p.id] === submittedKey)
      providerKeys = { ...providerKeys, [p.id]: "" };
    if (providerEnv[p.id] === submittedEnv)
      providerEnv = { ...providerEnv, [p.id]: "" };
  }
  let providerSaving = false;
  let providerSaveQueued = false;
  let providerSaveState = "idle";
  let providerSaveAttempt = "";
  function autoSaveProvider() {
    const p = settings?.providers.find((v: any) => v.id === selected);
    if (
      !p ||
      tab !== "providers" ||
      (!isDirty() &&
        !(
          creatingConnection &&
          (!usesDiscovery(p) || discoveryState === "success")
        ))
    )
      return;
    if (usesDiscovery(p) && discoveryState !== "success") return;
    const signature = JSON.stringify([
      p,
      providerKeys[p.id],
      providerEnv[p.id],
    ]);
    if (signature === providerSaveAttempt) return;
    if (providerSaving) {
      providerSaveQueued = true;
      return;
    }
    providerSaveAttempt = signature;
    providerSaving = true;
    providerSaveState = "saving";
    error = "";
    void persistProviders()
      .then(() => {
        providerSaveState = "saved";
      })
      .catch((e) => {
        providerSaveState = "error";
        error = (e as Error).message;
      })
      .finally(() => {
        providerSaving = false;
        if (providerSaveQueued) {
          providerSaveQueued = false;
          autoSaveProvider();
        }
      });
  }
  $: if (
    settings &&
    selected &&
    snapshot &&
    providerKeys &&
    providerEnv &&
    discoveryState
  )
    autoSaveProvider();
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
    return run(async () => {
      await api(path, data, method);
      await loadCollections();
    });
  }
  let sectionReady = false;
  let sectionSaveState = "idle";
  let sectionSaved = "";
  let sectionScheduled = "";
  let sectionAttempt = "";
  let sectionSaving = false;
  let sectionTimer: ReturnType<typeof setTimeout>;
  function sectionDraft() {
    if (tab === "providers" && !selected && !catalogOpen)
      return { defaultProviderId: settings.defaultProviderId };
    if (tab === "embeddings")
      return {
        baseUrl: settings.embedding.baseUrl,
        modelId: settings.embedding.modelId,
        apiKey: keys.embedding,
        removeKey: clear.embedding,
      };
    if (tab === "tools") return { replacement, confirm, replace };
    return null;
  }
  function scheduleSectionSave() {
    const draft = sectionDraft();
    if (!draft) return;
    const signature = JSON.stringify(draft);
    if (signature === sectionScheduled) return;
    sectionScheduled = signature;
    clearTimeout(sectionTimer);
    if (signature === sectionSaved) return;
    sectionSaveState = "pending";
    sectionTimer = setTimeout(
      () => void persistSection(),
      tab === "providers" ? 0 : 600,
    );
  }
  async function persistSection() {
    if (sectionSaving) return;
    const draft = sectionDraft();
    const signature = JSON.stringify(draft);
    if (!draft || signature === sectionSaved || signature === sectionAttempt)
      return;
    if (tab === "tools" && (!draft.replace || !draft.confirm)) return;
    sectionSaving = true;
    sectionAttempt = signature;
    sectionSaveState = "saving";
    error = "";
    let savedSignature = signature;
    try {
      if (tab === "tools") {
        const next = JSON.parse(draft.replacement!);
        if (
          !Array.isArray(next) ||
          next.some(
            (s) =>
              !s ||
              typeof s !== "object" ||
              "hasHeaders" in s ||
              "hasEnvironment" in s,
          )
        )
          throw Error(
            "Provide complete server configurations, not redacted presence flags.",
          );
        servers = (await api("/api/mcp", { servers: next }, "PUT")).servers;
        if (JSON.stringify(sectionDraft()) === signature) {
          replacement = "[]";
          replace = false;
          confirm = false;
          savedSignature = JSON.stringify(sectionDraft());
        }
      } else {
        let patch: any;
        if (tab === "providers" && !selected && !catalogOpen)
          patch = { defaultProviderId: draft.defaultProviderId };
        else {
          const url = new URL(draft.baseUrl!);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !draft.modelId?.trim()
          )
            throw Error("Enter a valid embedding URL and model ID.");
          patch = {
            embedding: { baseUrl: draft.baseUrl, modelId: draft.modelId },
          };
          if (draft.removeKey) patch.embedding.apiKey = "";
          else if (draft.apiKey) {
            await api("/api/settings/embedding-test", {
              baseUrl: draft.baseUrl,
              modelId: draft.modelId,
              apiKey: draft.apiKey,
            });
            // A key is saved only if the tested draft is still current.
            if (JSON.stringify(sectionDraft()) !== signature) return;
            patch.embedding.apiKey = draft.apiKey;
          }
        }
        const result = await api("/api/settings", patch);
        snapshot = JSON.stringify(result);
        if (JSON.stringify(sectionDraft()) === signature) {
          settings = result;
          if (tab === "embeddings") {
            keys.embedding = "";
            clear.embedding = false;
          }
          savedSignature = JSON.stringify(sectionDraft());
        }
      }
      sectionSaveState = "saved";
      sectionSaved = savedSignature;
    } catch (e) {
      sectionSaveState = "error";
      error =
        e instanceof SyntaxError
          ? "Enter valid JSON to save the MCP configuration."
          : (e as Error).message;
    } finally {
      sectionSaving = false;
      if (
        JSON.stringify(sectionDraft()) !== signature &&
        JSON.stringify(sectionDraft()) !== sectionSaved
      ) {
        sectionScheduled = "";
        scheduleSectionSave();
      }
    }
  }
  $: if (
    sectionReady &&
    settings &&
    keys &&
    clear &&
    replacement !== undefined &&
    confirm !== undefined &&
    replace !== undefined
  )
    scheduleSectionSave();
  onMount(() => {
    void run(
      async () => {
        settings = await api("/api/settings");
        initializeEditor();
        sectionSaved = JSON.stringify(sectionDraft());
        sectionScheduled = sectionSaved;
        sectionReady = true;
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
      clearTimeout(sectionTimer);
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
  <SettingsNavigation active={tab} />
  <div class="settings-content">
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
              </div>
              <Button href="/settings/providers/new"
                ><Plus />Add provider</Button
              >
            </div>
            <div class="list-toolbar">
              <Input
                aria-label="Find a provider"
                placeholder="Find a provider…"
                bind:value={query}
              />
            </div>
            <div
              class="provider-list"
              role="group"
              aria-label="Default chat provider"
            >
              {#each settings.providers.filter( (p: any) => matches(p.name), ) as p}
                <div class="provider-list-item">
                  <a class="provider-row" href={providerHref(p.id)}
                    ><span class="provider-mark"
                      ><ProviderLogo
                        service={p.service}
                        name={p.name}
                        baseUrl={p.baseUrl}
                      /></span
                    ><span class="provider-summary"
                      ><span class="provider-title">{p.name}</span><span
                        class="muted">{p.modelId}</span
                      ></span
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
                  <Button
                    variant="ghost"
                    size="sm"
                    class="default-provider-action"
                    aria-label={`Set ${p.name} as default`}
                    aria-pressed={settings.defaultProviderId === p.id}
                    title={settings.defaultProviderId === p.id
                      ? "Default for new conversations"
                      : "Use for new conversations"}
                    disabled={!p.modelId}
                    onclick={() => {
                      settings.defaultProviderId = p.id;
                    }}
                  >
                    {settings.defaultProviderId === p.id
                      ? "Default"
                      : "Set default"}
                  </Button>
                </div>
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
                      ><span
                        >{group.mode === "oauth"
                          ? preset.id === "openai-codex"
                            ? "ChatGPT (Codex)"
                            : "Claude"
                          : preset.name}</span
                      ><span class="muted">›</span></a
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
                >
                <h2 class="editor-title">
                  <ProviderLogo
                    service={settings.providers.find(
                      (p: any) => p.id === selected,
                    )?.service}
                    name={settings.providers.find((p: any) => p.id === selected)
                      ?.name ?? ""}
                    baseUrl={settings.providers.find(
                      (p: any) => p.id === selected,
                    )?.baseUrl ?? ""}
                  />{settings.providers.find((p: any) => p.id === selected)
                    ?.name}
                </h2>
              </div>

              <div class="grid">
                {#each settings.providers.filter((p: any) => p.id === selected) as p (p.id)}
                  <fieldset
                    class="card stack"
                    aria-label={`Provider ${p.name}`}
                  >
                    <legend class="sr-only"
                      ><span class="legend-content"
                        ><ProviderLogo
                          service={p.service}
                          name={p.name}
                          baseUrl={p.baseUrl}
                        />{p.name}</span
                      ></legend
                    >
                    <label
                      >Name<Input
                        bind:value={p.name}
                        required
                        maxlength={100}
                      /></label
                    >
                    {#if p.service === "custom"}
                      <label
                        >Base URL<Input
                          bind:value={p.baseUrl}
                          required
                          type="url"
                        /></label
                      >
                      <label
                        >Authentication<NativeSelect
                          class="w-full"
                          aria-label="Authentication"
                          bind:value={p.authMode}
                          ><option value="api_key">API key</option><option
                            value="none"
                            >No authentication (local endpoint)</option
                          ></NativeSelect
                        ></label
                      >
                      <label
                        >API protocol<NativeSelect
                          class="w-full"
                          aria-label="API protocol"
                          bind:value={p.protocol}
                          ><option value="openai-completions"
                            >OpenAI completions</option
                          ><option value="openai-responses"
                            >OpenAI responses</option
                          ><option value="anthropic-messages"
                            >Anthropic messages</option
                          ><option value="google-generative-ai"
                            >Google generative AI</option
                          ></NativeSelect
                        ></label
                      >
                    {:else}
                      <dl class="connection-details">
                        <div>
                          <dt>Model service</dt>
                          <dd>
                            {settings.catalog.find(
                              (v: any) => v.id === p.service,
                            )?.name ?? "Custom endpoint"}
                          </dd>
                        </div>
                        <div>
                          <dt>Authentication</dt>
                          <dd>
                            {p.authMode === "oauth"
                              ? "Account login / OAuth"
                              : p.authMode === "ambient"
                                ? "Server credentials"
                                : p.authMode === "none"
                                  ? "No authentication"
                                  : "API key"}
                          </dd>
                        </div>
                        <div>
                          <dt>Base URL</dt>
                          <dd>{p.baseUrl || "Provider-managed endpoint"}</dd>
                        </div>
                      </dl>
                    {/if}
                    {#if !usesDiscovery(p)}
                      <label
                        >Default model ID<NativeSelect
                          class="w-full"
                          aria-label="Default model ID"
                          bind:value={p.modelId}
                        >
                          {#each settings.catalog.find((v: any) => v.id === p.service)?.models ?? [] as model}<option
                              value={model.id}>{model.id}</option
                            >{/each}
                        </NativeSelect></label
                      >
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
                      {#if discoveryState === "loading"}<p
                          class="discovery-message"
                          aria-live="polite"
                        >
                          <LoaderCircle size={16} class="animate-spin" />Testing
                          connection and loading models…
                        </p>
                      {:else if discoveryState === "error"}<div
                          class="discovery-message"
                        >
                          <p class="error" role="alert">{discoveryError}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Retry connection"
                            title="Retry connection"
                            onclick={() => {
                              discoverySignature = "";
                              scheduleDiscovery(p, providerKeys[p.id] ?? "");
                            }}><RotateCw /></Button
                          >
                        </div>
                      {:else if discoveryState === "success"}<p
                          class="discovery-message"
                          aria-live="polite"
                        >
                          <CheckCircle2 size={16} />Connection verified · {modelOptions.length}
                          models
                        </p>
                      {:else}<p class="muted">
                          Enter your API key to connect and load available
                          models.
                        </p>{/if}
                      {#if discoveryState === "success"}<label
                          >Default model ID<NativeSelect
                            class="w-full"
                            aria-label="Default model ID"
                            bind:value={p.modelId}
                            >{#each modelOptions as id}<option value={id}
                                >{id}</option
                              >{/each}</NativeSelect
                          ></label
                        >{/if}
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
              <SaveIndicator
                state={providerSaveState}
                hint="Changes save automatically. API keys save only after a successful connection test."
                onretry={() => {
                  providerSaveAttempt = "";
                  autoSaveProvider();
                }}
              />
            </form>
          {/if}
        </section>
      {:else if tab === "embeddings"}
        <section>
          <h2>Embeddings</h2>

          <form
            class="card stack"
            style="margin-top:24px"
            onsubmit={(e) => {
              e.preventDefault();
              void persistSection();
            }}
          >
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
              ><Checkbox bind:checked={clear.embedding} />Remove saved API key</label
            >
            <p class="muted">
              Independent OpenAI-compatible embeddings endpoint. Chat
              subscriptions and OAuth tokens are never used here. Changes
              require an explicit collection reindex.
            </p>
          </form>
        </section>
      {:else if tab === "knowledge"}
        <KnowledgeCollections
          {collections}
          {documents}
          oncreate={async (collectionName: string) => {
            return run(async () => {
              await api("/api/knowledge-bases", { name: collectionName });
              await loadCollections();
            }, "Collection created");
          }}
          onupload={upload}
          onmutate={mutate}
        />
      {:else if tab === "skills"}
        <Skills />
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
            </div>{/each}<Button
            variant="outline"
            onclick={() => (replace = !replace)}
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
              ><Checkbox bind:checked={confirm} />I intend to replace all
              servers and their secrets</label
            >{/if}
        </section>
      {/if}
      {#if ["embeddings", "tools"].includes(tab) || (tab === "providers" && !selected && !catalogOpen)}
        <SaveIndicator
          state={sectionSaveState}
          hint={tab === "providers"
            ? "The default applies to new conversations. Existing chats keep their model."
            : "Changes save automatically. Embedding API keys save only after a successful test. MCP replacement requires acknowledgement."}
          onretry={() => {
            sectionAttempt = "";
            void persistSection();
          }}
        />
        {#if tab === "tools" && replace && !confirm}<p class="muted">
            Confirm replacement to save valid edits automatically.
          </p>{/if}
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
    background: var(--canvas);
  }
  .settings-content {
    overflow-wrap: anywhere;
    min-width: 0;
    width: 100%;
    max-width: 816px;
    margin: 0 auto;
    padding: 40px 48px 64px;
  }
  .settings-content:has(.vendor-grid) {
    max-width: 1076px;
  }
  .settings-content section {
    margin: 0;
  }
  .settings-content section.card,
  .settings-content :global(form.card) {
    border: 0;
    padding: 0;
    border-radius: 0;
  }
  h2 {
    font-size: 20px;
    line-height: 1.3;
    margin: 0 0 16px;
    letter-spacing: -0.4px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  .section-heading h2 {
    margin: 0;
  }
  .editor-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    overflow-wrap: anywhere;
  }
  .section-heading p {
    margin: 6px 0 0;
  }
  .section-heading > :global([data-slot="button"]) {
    white-space: nowrap;
  }
  .list-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 20px;
  }
  .list-toolbar :global(input) {
    flex: 1;
    width: 100%;
  }
  .provider-list {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .provider-list-item {
    display: flex;
    align-items: center;
    padding-right: 12px;
  }
  .provider-list-item:hover,
  .provider-list-item:focus-within {
    background: var(--sidebar);
  }
  .provider-list-item .provider-row {
    flex: 1;
    min-width: 0;
  }
  :global(.default-provider-action) {
    color: var(--muted);
    background: transparent;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 400;
    min-width: 78px;
    padding: 4px 8px;
  }
  :global(.default-provider-action[aria-pressed="true"]) {
    color: var(--accent);
    font-weight: 500;
  }
  .provider-row {
    text-decoration: none;
    display: flex;
    gap: 12px;
    width: 100%;
    text-align: left;
    align-items: center;
    padding: 16px;
    color: inherit;
  }
  .provider-list-item + .provider-list-item {
    border-top: 1px solid var(--border);
  }
  .vendor:hover {
    background: var(--sidebar);
  }
  .provider-mark {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }
  .provider-summary {
    display: grid;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .provider-title {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-weight: 500;
  }
  .provider-summary .muted {
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider-kind {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }
  .list-note {
    display: none;
  }
  :global(.catalog-search) {
    width: 100%;
    margin-bottom: 24px;
  }
  .catalog-group {
    margin: 0 0 28px;
  }
  .catalog-group h3 {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 0 0 12px;
  }
  .catalog-group h3 span {
    font-weight: 400;
  }
  .vendor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 16px;
  }
  .vendor {
    text-decoration: none;
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px;
    color: inherit;
    border-radius: 8px;
    min-width: 0;
  }
  .vendor span:nth-child(2) {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .legend-content {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .settings-content .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-content :global(fieldset.card) {
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
  }
  .settings-content :global(fieldset.card > legend) {
    padding: 0 0 24px;
    font-weight: 600;
    font-size: 20px;
  }
  .connection-details {
    display: grid;
    gap: 10px;
    padding: 8px 0 24px;
    margin: 0 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .connection-details div {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 16px;
  }
  .connection-details dt {
    color: var(--muted);
    font-size: 13px;
  }
  .connection-details dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .connection-details div:last-child dd {
    font-family: var(--font-mono);
  }
  .discovery-message {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .discovery-message p {
    margin: 0;
  }
  .empty {
    margin: 0;
    padding: 24px;
  }
  @media (max-width: 767px) {
    .settings-shell {
      display: block;
    }
    .settings-content {
      padding: 24px 16px 40px;
    }
    .vendor-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .connection-details div {
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 8px;
    }
    .provider-row {
      padding: 12px;
      gap: 10px;
    }
    .provider-kind {
      max-width: 96px;
    }
    .section-heading {
      gap: 8px;
    }
  }
</style>

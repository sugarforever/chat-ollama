<script lang="ts">
  import ChatNavigation from "$lib/components/shell/ChatNavigation.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import NativeSelect from "$lib/components/ui/native-select/native-select.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import {
    SquarePen,
    ChevronDown,
    ArrowUp,
    Square,
    LoaderCircle,
  } from "@lucide/svelte";
  import AppIcon from "$lib/AppIcon.svelte";
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  import { onMount } from "svelte";
  import { pushState, replaceState } from "$app/navigation";
  import MarkdownIt from "markdown-it";
  import { api } from "$lib/client";
  import type { ConversationSnapshot } from "$lib/contracts";
  let conversations: any[] = [];
  let collections: any[] = [];
  let servers: any[] = [];
  let selectedCollections: string[] = [];
  let selectedServers: string[] = [];
  let modelId = "";
  let providerId = "";
  let catalog: { id: string; models: { id: string; name: string }[] }[] = [];
  const choices = (id: string) => {
    const provider = providers.find((p) => p.id === id);
    return (
      provider?.models?.map((id) => ({ id, name: id })) ??
      catalog.find((p) => p.id === provider?.service)?.models ??
      []
    );
  };
  let providers: import("$lib/contracts").PublicProvider[] = [];
  let conversationProvider = "";
  let conversationModel = "";
  let current = "";
  let snapshot: ConversationSnapshot | undefined;
  let draft = "";
  let error = "";
  let connection = "Connecting";
  let creating = false;
  let editingModel = false;
  let modelButton: HTMLButtonElement | null = null;
  let newButton: HTMLElement | undefined;
  function closeModelEditor() {
    editingModel = false;
    modelButton?.focus();
  }
  function startCreation(trigger?: HTMLElement | MouseEvent) {
    const control =
      trigger instanceof HTMLElement ? trigger : trigger?.currentTarget;
    if (control instanceof HTMLElement) newButton = control;
    editingModel = false;
    creating = true;
  }
  function closeCreation() {
    creating = false;
    newButton?.focus();
  }
  let source: any;
  let stream: EventSource | undefined;
  let validSources = new Set<string>();
  let generation = 0;
  // Local stream delivery order also survives process-local server revision resets.
  let streamUpdates = 0;
  const md = new MarkdownIt({ html: false, linkify: false });
  md.renderer.rules.image = (tokens, idx) =>
    md.utils.escapeHtml(tokens[idx].content);
  function render(content: string, allowed: Set<string>) {
    const tokens = md.parse(content, {});
    for (const token of tokens) {
      const children = token.children;
      if (!children) continue;
      const remove: number[] = [];
      for (let i = 0; i < children.length; i++) {
        const t = children[i];
        if (t.type !== "link_open") continue;
        const href = String(t.attrGet("href") ?? "");
        if (/^https?:\/\//i.test(href)) {
          t.attrSet("rel", "noopener noreferrer");
          continue;
        }
        if (allowed.has(href)) continue;
        remove.push(i);
        const end = children.findIndex(
          (v, j) => j > i && v.type === "link_close",
        );
        if (end >= 0) remove.push(end);
      }
      token.children = children.filter((_, i) => !remove.includes(i));
    }
    return md.renderer.render(tokens, md.options, {});
  }
  $: busy = snapshot?.status === "running" || snapshot?.status === "cancelling";
  let disposed = false;
  function active(own: number, id: string) {
    return !disposed && own === generation && id === current;
  }
  function applySnapshot(
    own: number,
    id: string,
    next: ConversationSnapshot,
    expectedStreamUpdates = streamUpdates,
  ) {
    if (!active(own, id) || expectedStreamUpdates !== streamUpdates) return;
    if (
      next.selection &&
      (snapshot?.selection?.providerId !== next.selection.providerId ||
        snapshot?.selection?.modelId !== next.selection.modelId)
    ) {
      conversationProvider = next.selection.providerId;
      conversationModel = next.selection.modelId;
    }
    snapshot = next;
    void validateCitations();
  }
  async function readSnapshot(own: number, id: string) {
    const beforeRead = streamUpdates;
    const next = await api(`/api/conversations/${id}`);
    applySnapshot(own, id, next, beforeRead);
  }
  async function refresh() {
    const [nextConversations, nextCollections, nextMcp] = await Promise.all([
      api("/api/conversations"),
      api("/api/knowledge-bases"),
      api("/api/mcp"),
    ]);
    if (disposed) return;
    conversations = nextConversations;
    collections = nextCollections;
    servers = nextMcp.servers;
  }
  async function open(
    id: string,
    navigation: "push" | "replace" | "none" = "push",
  ) {
    if (disposed) return;
    const own = ++generation;
    editingModel = false;
    stream?.close();
    if (current !== id) {
      snapshot = undefined;
      source = undefined;
      validSources = new Set();
    }
    const changed = current !== id;
    current = id;
    const url = `/?conversation=${encodeURIComponent(id)}`;
    if (navigation === "replace") replaceState(url, {});
    else if (navigation === "push" && changed) pushState(url, {});
    connection = "Connecting";
    try {
      await readSnapshot(own, id);
      if (!active(own, id)) return;
      stream = new EventSource(`/api/conversations/${id}/events`);
      stream.onopen = () => {
        if (active(own, id)) connection = "Connected";
      };
      stream.onerror = () => {
        if (active(own, id))
          connection = "Reconnecting — confirmed messages are saved";
      };
      stream.onmessage = (event) => {
        if (!active(own, id)) return;
        streamUpdates++;
        applySnapshot(own, id, JSON.parse(event.data).snapshot);
      };
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    }
  }
  async function validateCitations() {
    const own = generation,
      id = current;
    const urls = [
      ...new Set(
        (snapshot?.entries.map((e) => e.content).join("\n") ?? "").match(
          /\/sources\/[a-zA-Z0-9_-]+/g,
        ) ?? [],
      ),
    ];
    for (const url of urls) {
      if (!active(own, id)) return;
      if (validSources.has(url)) continue;
      try {
        await api(`/api${url}?conversationId=${encodeURIComponent(id)}`);
        if (!active(own, id)) return;
        validSources = new Set([...validSources, url]);
      } catch {
        /* Invalid citations stay inert. */
      }
    }
  }
  async function create() {
    const own = generation,
      id = current;
    error = "";
    try {
      const c = await api("/api/conversations", {
        providerId,
        modelId,
        knowledgeBaseIds: selectedCollections,
        mcpServerIds: selectedServers,
      });
      if (!active(own, id)) return;
      creating = false;
      await refresh();
      if (active(own, id)) await open(c.id);
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    }
  }
  async function selectModel(event: SubmitEvent) {
    event.preventDefault();
    const own = generation,
      id = current;
    error = "";
    try {
      const beforeRead = streamUpdates;
      const next = await api(
        `/api/conversations/${id}`,
        { providerId: conversationProvider, modelId: conversationModel },
        "PATCH",
      );
      applySnapshot(own, id, next, beforeRead);
      if (active(own, id)) closeModelEditor();
      const list = await api("/api/conversations");
      if (active(own, id)) conversations = list;
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    }
  }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    const own = generation,
      id = current,
      content = draft;
    error = "";
    try {
      await api(`/api/conversations/${id}/messages`, {
        content,
        requestId: crypto.randomUUID(),
      });
      if (!active(own, id)) return;
      if (draft === content) draft = "";
      await readSnapshot(own, id);
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    }
  }
  async function action(name: string) {
    const own = generation,
      id = current;
    try {
      await api(`/api/conversations/${id}/${name}`, {});
      if (!active(own, id)) return;
      await readSnapshot(own, id);
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    }
  }
  async function clickCitation(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href === "#" || href.startsWith("/sources/")) event.preventDefault();
    const own = generation,
      id = current;
    if (validSources.has(href)) {
      try {
        const next = await api(
          `/api${href}?conversationId=${encodeURIComponent(id)}`,
        );
        if (active(own, id)) source = next;
      } catch (e) {
        if (!active(own, id)) return;
        error = (e as Error).message;
        validSources = new Set([...validSources].filter((x) => x !== href));
      }
    }
  }
  onMount(() => {
    const initial = generation;
    const offline = () => {
      stream?.close();
      connection = "Reconnecting — confirmed messages are saved";
    };
    const online = () => {
      if (!disposed && current) void open(current, "none");
    };
    const navigateHistory = () => {
      const selected = new URLSearchParams(location.search).get("conversation");
      creating = false;
      if (selected && selected !== current) void open(selected, "none");
      else if (!selected) {
        generation++;
        stream?.close();
        current = "";
        snapshot = undefined;
        source = undefined;
      }
    };
    window.addEventListener("popstate", navigateHistory);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    void (async () => {
      try {
        await refresh();
        if (disposed || initial !== generation) return;
        const settings = await api("/api/settings");
        if (disposed || initial !== generation) return;
        providers = settings.providers;
        catalog = settings.catalog;
        providerId = settings.defaultProviderId;
        modelId = providers.find((p) => p.id === providerId)?.modelId ?? "";
        if (conversations.length) {
          const selected = new URLSearchParams(location.search).get(
            "conversation",
          );
          await open(
            conversations.find((c) => c.id === selected)?.id ??
              conversations[conversations.length - 1].id,
            "replace",
          );
        }
      } catch (e) {
        if (!disposed && initial === generation) error = (e as Error).message;
      }
    })();
    return () => {
      disposed = true;
      generation++;
      stream?.close();
      window.removeEventListener("popstate", navigateHistory);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  });
</script>

<svelte:head><title>Chat · Chat Ollama</title></svelte:head>
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") {
      source = undefined;
      if (creating) closeCreation();
      if (editingModel) closeModelEditor();
    }
  }}
/>
<div class="shell">
  <ChatNavigation
    {conversations}
    {current}
    onselect={(id) => {
      creating = false;
      void open(id);
    }}
    onnew={startCreation}
  />
  <main class="main">
    <header class="topbar">
      <h1 class="top-title">
        {creating
          ? "New conversation"
          : current
            ? `Conversation ${conversations.findIndex((c) => c.id === current) + 1}`
            : "ChatOllama"}
      </h1>
      {#if snapshot && !creating}
        <Button
          variant="outline"
          class="model-chip"
          bind:ref={modelButton}
          aria-label="Change model"
          title="Change model"
          aria-expanded={editingModel}
          aria-controls="model-editor"
          onclick={() => (editingModel = !editingModel)}
        >
          <ProviderLogo
            service={providers.find(
              (p) => p.id === snapshot?.selection?.providerId,
            )?.service}
            name={providers.find(
              (p) => p.id === snapshot?.selection?.providerId,
            )?.name ?? ""}
            baseUrl={providers.find(
              (p) => p.id === snapshot?.selection?.providerId,
            )?.baseUrl ?? ""}
          />
          <span class="truncate">{snapshot.selection?.modelId}</span
          ><ChevronDown size={14} />
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        class="mobile-new"
        aria-label="New conversation"
        title="New conversation"
        onclick={startCreation}><SquarePen size={18} /></Button
      >
    </header>
    {#if current && connection !== "Connected"}<p
        class="connection-line"
        role="status"
      >
        <LoaderCircle size={14} class="animate-spin" />{connection}
      </p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <datalist id="new-model-options"
      >{#each choices(providerId) as m}<option value={m.id}>{m.id}</option
        >{/each}</datalist
    >
    <datalist id="conversation-model-options"
      >{#each choices(conversationProvider) as m}<option value={m.id}
          >{m.id}</option
        >{/each}</datalist
    >
    {#if creating}<section
        class="creation card stack"
        aria-label="New conversation settings"
      >
        <div class="creation-heading">
          <div>
            <h1>New conversation</h1>
            <p class="muted">
              Choose a model, then add knowledge and tools if you need them.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="icon-button"
            aria-label="Cancel new conversation"
            onclick={closeCreation}><AppIcon name="close" /></Button
          >
        </div>
        <div class="creation-models">
          <label
            >Provider<NativeSelect
              class="w-full"
              aria-label="Provider"
              bind:value={providerId}
              onchange={() => {
                modelId =
                  providers.find((p) => p.id === providerId)?.modelId ?? "";
              }}
              >{#each providers as p}<option value={p.id}>{p.name}</option
                >{/each}</NativeSelect
            ></label
          >
          <label
            >Model ID<Input
              bind:value={modelId}
              list="new-model-options"
              required
              maxlength={200}
            /></label
          >
        </div>
        <div class="creation-options">
          <div class="option-group">
            <h3><AppIcon name="book" />Knowledge collections</h3>
            {#each collections as c}<label class="check"
                ><Checkbox
                  aria-label={c.name}
                  checked={selectedCollections.includes(c.id)}
                  onCheckedChange={(checked) => {
                    selectedCollections = checked
                      ? [...selectedCollections, c.id]
                      : selectedCollections.filter((id) => id !== c.id);
                  }}
                />{c.name}{c.needsReindex ? " · reindex required" : ""}</label
              >{/each}{#if !collections.length}<p class="muted">
                Add collections in Settings.
              </p>{/if}
          </div>
          <div class="option-group">
            <h3><AppIcon name="tools" />MCP servers</h3>
            <p class="muted">
              Selected servers may act without per-call approval.
            </p>
            {#each servers as s}<label class="check"
                ><Checkbox
                  aria-label={s.id}
                  checked={selectedServers.includes(s.id)}
                  onCheckedChange={(checked) => {
                    selectedServers = checked
                      ? [...selectedServers, s.id]
                      : selectedServers.filter((id) => id !== s.id);
                  }}
                />{s.id}</label
              >{/each}
          </div>
        </div>
        <div class="row creation-actions">
          <Button class="primary" onclick={create}>Create conversation</Button
          ><Button variant="ghost" onclick={closeCreation}>Cancel</Button>
        </div>
      </section>
    {:else if snapshot}
      {#if editingModel}<form
          id="model-editor"
          class="model-editor"
          onsubmit={selectModel}
        >
          <label
            >Conversation provider<NativeSelect
              class="w-full"
              aria-label="Conversation provider"
              bind:value={conversationProvider}
              onchange={() => {
                conversationModel =
                  providers.find((p) => p.id === conversationProvider)
                    ?.modelId ?? "";
              }}
            >
              {#if !providers.some((p) => p.id === conversationProvider)}<option
                  value={conversationProvider}
                  >Unavailable provider · choose another</option
                >{/if}
              {#each providers as p}<option value={p.id}>{p.name}</option
                >{/each}
            </NativeSelect></label
          >
          <label
            >Conversation model ID<Input
              bind:value={conversationModel}
              list="conversation-model-options"
              required
              maxlength={200}
            /></label
          >
          <Button
            type="submit"
            disabled={!providers.some((p) => p.id === conversationProvider) ||
              !conversationModel.trim()}>Apply to next message</Button
          >
          <span class="muted"
            >Saved: {providers.find(
              (p) => p.id === snapshot?.selection?.providerId,
            )?.name ?? "Unavailable provider"} · {snapshot.selection?.modelId}.
            Changes apply to subsequent input.</span
          >
        </form>{/if}
      {#if snapshot.status === "failed"}
        <p class="error" role="status">
          Run failed. Check your provider authentication and model settings,
          then send a new message.
        </p>
      {:else if snapshot.status === "interrupted" && !snapshot.mcpUncertainty}
        <p class="notice" role="status">
          The previous run was interrupted. You can send a new message.
        </p>
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
      <div
        class="transcript"
        onclick={clickCitation}
        role="log"
        aria-label="Conversation messages"
      >
        {#each snapshot.entries.filter((e) => e.content || e.kind === "tool") as entry (entry.id)}<article
            class="entry {entry.kind}"
          >
            <strong class="role"
              >{entry.kind === "assistant"
                ? "Assistant"
                : entry.kind === "user"
                  ? "You"
                  : "Tool activity"}</strong
            >{#if entry.kind === "tool"}<details>
                <summary
                  >{entry.toolName ?? "Tool"} · {entry.toolStatus ??
                    "done"}{entry.uncertain ? " · uncertain" : ""}</summary
                >
                <pre>{entry.content}</pre>
              </details>{:else}<div>
                {@html render(entry.content, validSources)}
              </div>
              {#if entry.partial}<span class="muted">Writing…</span>{/if}{/if}
          </article>{/each}{#if !snapshot.entries.length}<div class="empty">
            <h1>What’s on your mind?</h1>
            <p class="muted">
              Ask a question, explore an idea, or search your selected
              knowledge.
            </p>
          </div>{/if}
      </div>
      {#if snapshot.mcpUncertainty}<div class="notice">
          <strong>An external action has an uncertain outcome.</strong>
          <p>{snapshot.mcpUncertainty}</p>
          <p>
            Check the external system before continuing. Acknowledging does not
            repeat the action.
          </p>
          <Button disabled={busy} onclick={() => action("acknowledge")}
            >I checked the outcome — acknowledge</Button
          >
        </div>{/if}
      <form class="composer-wrap" onsubmit={send}>
        {#if busy}<p class="status-line" role="status">
            <LoaderCircle size={14} class="animate-spin" />{snapshot.status ===
            "cancelling"
              ? "Stopping…"
              : "Working…"}
          </p>{/if}
        <div class="composer">
          <label for="message" class="composer-label">Message</label><Textarea
            id="message"
            bind:value={draft}
            placeholder="Message"
            rows={1}
            disabled={busy || !!snapshot.mcpUncertainty}
          ></Textarea>
          {#if busy}<Button
              type="button"
              class="send-button"
              aria-label="Stop"
              title="Stop"
              onclick={() => action("stop")}
              disabled={snapshot.status === "cancelling"}
              ><Square size={15} fill="currentColor" /></Button
            >
          {:else}<Button
              type="submit"
              class="send-button"
              aria-label="Send message"
              title="Send message"
              disabled={!draft.trim() || !!snapshot.mcpUncertainty}
              ><ArrowUp size={20} /></Button
            >{/if}
        </div>
      </form>{:else}<div class="workspace-empty">
        <h1>What’s on your mind?</h1>
        <p class="muted">Choose a model to start a conversation.</p>
        <Button class="primary" onclick={startCreation}
          >Start a conversation<AppIcon name="arrow" size={16} /></Button
        ><a href="/settings" class="empty-settings"
          >Manage models and connections</a
        >
      </div>{/if}
  </main>
</div>
{#if source}<aside class="source" aria-label="Source excerpt">
    <div class="source-header">
      <span class="eyebrow">KNOWLEDGE / SOURCE</span><Button
        variant="ghost"
        class="subtle"
        onclick={() => (source = undefined)}
        ><AppIcon name="close" size={16} />Close source</Button
      >
    </div>
    <h2>{source.title}</h2>
    {#if source.page}<p class="muted">Page {source.page}</p>{/if}
    <p style="white-space:pre-wrap">{source.text}</p>
  </aside>{/if}

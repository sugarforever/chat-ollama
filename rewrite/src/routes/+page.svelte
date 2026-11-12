<script lang="ts">
  import AppIcon from "$lib/AppIcon.svelte";
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  import { onMount } from "svelte";
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
  const choices = (id: string) =>
    catalog.find((p) => p.id === providers.find((p) => p.id === id)?.service)
      ?.models ?? [];
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
  let modelButton: HTMLButtonElement | undefined;
  let newButton: HTMLButtonElement | undefined;
  function closeModelEditor() {
    editingModel = false;
    modelButton?.focus();
  }
  function startCreation() {
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
  async function open(id: string) {
    if (disposed) return;
    const own = ++generation;
    editingModel = false;
    stream?.close();
    if (current !== id) {
      snapshot = undefined;
      source = undefined;
      validSources = new Set();
    }
    current = id;
    history.replaceState(null, "", `?conversation=${encodeURIComponent(id)}`);
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
      if (!disposed && current) void open(current);
    };
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
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="Chat Ollama home"
      ><span class="brand-symbol"><AppIcon /></span>Chat Ollama</a
    >
    <button class="primary" bind:this={newButton} onclick={startCreation}
      ><AppIcon name="plus" />New conversation</button
    >
    <div class="sidebar-label">Conversations</div>
    <nav aria-label="Conversations">
      {#each conversations as conversation, i}<button
          class:active={current === conversation.id}
          onclick={() => open(conversation.id)}
          ><AppIcon /><span class="conversation-label"
            ><span>Conversation {i + 1}</span><span class="muted"
              >{conversation.config.modelId}</span
            ></span
          ></button
        >{/each}
    </nav>
    <div class="sidebar-footer">
      <a href="/settings"><AppIcon name="settings" />Settings</a><span
        class="muted">Your private workspace</span
      >
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="breadcrumbs">
        <span>Workspace</span><span>/</span><strong
          >{creating
            ? "New conversation"
            : current
              ? "Conversation"
              : "Chat"}</strong
        >
      </div>
      <span
        class="status connection"
        class:online={connection === "Connected" || !current}
        >{current ? connection : "Private · persistent"}</span
      >
    </header>
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
            <span class="eyebrow">CHAT</span>
            <h1>New conversation</h1>
            <p class="muted">
              Choose a model, then add knowledge and tools if you need them.
            </p>
          </div>
          <button
            class="icon-button"
            aria-label="Cancel new conversation"
            onclick={closeCreation}><AppIcon name="close" /></button
          >
        </div>
        <div class="creation-models">
          <label
            >Provider<select
              aria-label="Provider"
              bind:value={providerId}
              onchange={() => {
                modelId =
                  providers.find((p) => p.id === providerId)?.modelId ?? "";
              }}
              >{#each providers as p}<option value={p.id}>{p.name}</option
                >{/each}</select
            ></label
          >
          <label
            >Model ID<input
              bind:value={modelId}
              list="new-model-options"
              required
              maxlength="200"
            /></label
          >
        </div>
        <div class="creation-options">
          <div class="option-group">
            <h3><AppIcon name="book" />Knowledge collections</h3>
            {#each collections as c}<label class="check"
                ><input
                  type="checkbox"
                  bind:group={selectedCollections}
                  value={c.id}
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
                ><input
                  type="checkbox"
                  bind:group={selectedServers}
                  value={s.id}
                />{s.id}</label
              >{/each}
          </div>
        </div>
        <div class="row creation-actions">
          <button class="primary" onclick={create}>Create conversation</button
          ><button onclick={closeCreation}>Cancel</button>
        </div>
      </section>
    {:else if snapshot}
      <div class="model-toolbar">
        <div class="model-summary">
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
          /><span
            ><strong
              >{providers.find((p) => p.id === snapshot?.selection?.providerId)
                ?.name ?? "Unavailable provider"}</strong
            ><span class="muted">{snapshot.selection?.modelId}</span></span
          >
        </div>
        <button
          class="subtle"
          bind:this={modelButton}
          aria-expanded={editingModel}
          aria-controls="model-editor"
          onclick={() => (editingModel = !editingModel)}
          >Change model<AppIcon name="chevron" size={14} /></button
        >
      </div>
      {#if editingModel}<form
          id="model-editor"
          class="model-editor"
          onsubmit={selectModel}
        >
          <label
            >Conversation provider<select
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
            </select></label
          >
          <label
            >Conversation model ID<input
              bind:value={conversationModel}
              list="conversation-model-options"
              required
              maxlength="200"
            /></label
          >
          <button
            disabled={!providers.some((p) => p.id === conversationProvider) ||
              !conversationModel.trim()}>Apply to next message</button
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
          <button disabled={busy} onclick={() => action("acknowledge")}
            >I checked the outcome — acknowledge</button
          >
        </div>{/if}
      <form class="composer stack" onsubmit={send}>
        <label for="message" class="composer-label">Message</label><textarea
          id="message"
          bind:value={draft}
          placeholder="Ask anything…"
          disabled={busy || !!snapshot.mcpUncertainty}></textarea>
        <div class="row composer-actions">
          {#if busy}<button
              type="button"
              onclick={() => action("stop")}
              disabled={snapshot.status === "cancelling"}>Stop</button
            ><span class="muted"
              >{snapshot.status === "cancelling"
                ? "Stopping…"
                : "Working…"}</span
            >{:else}<button
              class="primary"
              disabled={!draft.trim() || !!snapshot.mcpUncertainty}
              ><AppIcon name="send" size={16} />Send message</button
            >{/if}<span class="muted composer-note"
            >Work continues when you close this browser. Use Stop to cancel.</span
          >
        </div>
      </form>{:else}<div class="workspace-empty">
        <div class="empty-symbol"><AppIcon size={28} /></div>
        <span class="eyebrow">YOUR WORKSPACE</span>
        <h1>A place for your next idea.</h1>
        <p class="muted">
          Start a conversation with your models.<br />Bring your knowledge and
          tools when you need them.
        </p>
        <button class="primary" onclick={startCreation}
          >Start a conversation<AppIcon name="arrow" size={16} /></button
        ><a href="/settings" class="empty-settings"
          >Manage models and connections</a
        >
      </div>{/if}
  </main>
</div>
{#if source}<aside class="source" aria-label="Source excerpt">
    <div class="source-header">
      <span class="eyebrow">KNOWLEDGE / SOURCE</span><button
        class="subtle"
        onclick={() => (source = undefined)}
        ><AppIcon name="close" size={16} />Close source</button
      >
    </div>
    <h2>{source.title}</h2>
    {#if source.page}<p class="muted">Page {source.page}</p>{/if}
    <p style="white-space:pre-wrap">{source.text}</p>
    <p class="muted">Source: {source.sourceId}</p>
  </aside>{/if}

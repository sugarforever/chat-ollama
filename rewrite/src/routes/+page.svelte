<script lang="ts">
  import ChatNavigation from "$lib/components/shell/ChatNavigation.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { SquarePen, ArrowUp, Square, LoaderCircle } from "@lucide/svelte";
  import AppIcon from "$lib/AppIcon.svelte";
  import ModelSelector from "$lib/components/ModelSelector.svelte";
  import { onMount, tick } from "svelte";
  import { pushState, replaceState } from "$app/navigation";
  import MarkdownIt from "markdown-it";
  import { api } from "$lib/client";
  import type { ConversationSnapshot } from "$lib/contracts";
  let conversations: any[] = [];
  let catalog: { id: string; models: { id: string; name: string }[] }[] = [];
  let providers: import("$lib/contracts").PublicProvider[] = [];
  let current = "";
  let snapshot: ConversationSnapshot | undefined;
  let draft = "";
  let sending = false;
  let error = "";
  let connection = "Connecting";
  let creating = false;
  let loading = true;
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
    snapshot = next;
    void validateCitations();
  }
  async function readSnapshot(own: number, id: string) {
    const beforeRead = streamUpdates;
    const next = await api(`/api/conversations/${id}`);
    applySnapshot(own, id, next, beforeRead);
  }
  async function refresh() {
    const nextConversations = await api("/api/conversations");
    if (!disposed) conversations = nextConversations;
  }

  async function open(
    id: string,
    navigation: "push" | "replace" | "none" = "push",
  ) {
    if (disposed) return;
    const own = ++generation;
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
  async function startCreation() {
    if (creating || loading) return;
    creating = true;
    const own = generation,
      id = current;
    error = "";
    try {
      const settings = await api("/api/settings");
      if (!active(own, id)) return;
      providers = settings.providers;
      catalog = settings.catalog;
      const provider = settings.providers.find(
        (provider: import("$lib/contracts").PublicProvider) =>
          provider.id === settings.defaultProviderId,
      );
      if (!provider?.modelId)
        throw new Error(
          "Choose a default provider and model in Settings → Providers.",
        );
      const c = await api("/api/conversations", {
        providerId: provider.id,
        modelId: provider.modelId,
        knowledgeBaseIds: [],
        mcpServerIds: [],
      });
      if (!active(own, id)) return;
      await refresh();
      if (active(own, id)) {
        await open(c.id);
        await tick();
        document.getElementById("message")?.focus();
      }
    } catch (e) {
      if (active(own, id)) error = (e as Error).message;
    } finally {
      creating = false;
    }
  }
  async function selectModel(
    selection: import("$lib/contracts").ProviderSelection,
  ) {
    const own = generation,
      id = current;
    const beforeRead = streamUpdates;
    const next = await api(`/api/conversations/${id}`, selection, "PATCH");
    if (!active(own, id)) return;
    applySnapshot(own, id, next, beforeRead);
    const list = await api("/api/conversations");
    if (active(own, id)) conversations = list;
  }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    if (sending || busy || snapshot?.mcpUncertainty || !draft.trim()) return;
    sending = true;
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
    } finally {
      sending = false;
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
      } finally {
        if (!disposed) loading = false;
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
    }
  }}
/>
<div class="shell">
  <ChatNavigation
    {conversations}
    {current}
    onselect={(id) => {
      void open(id);
    }}
    onnew={startCreation}
    creating={creating || loading}
  />
  <main class="main">
    <header class="topbar">
      <h1 class="top-title">
        {current
          ? `Conversation ${conversations.findIndex((c) => c.id === current) + 1}`
          : "ChatOllama"}
      </h1>
      {#if snapshot?.selection}
        {#key current}<ModelSelector
            {providers}
            {catalog}
            selection={snapshot.selection}
            onselect={selectModel}
          />{/key}
      {/if}
      <Button
        variant="ghost"
        size="icon"
        class="mobile-new"
        aria-label="New conversation"
        title="New conversation"
        disabled={creating || loading}
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
    {#if snapshot}
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
        <div class="composer" class:working={busy}>
          <label for="message" class="composer-label">Message</label><Textarea
            id="message"
            class={busy ? "composer-input-busy" : ""}
            bind:value={draft}
            placeholder="Message"
            rows={1}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onkeydown={(event) => {
              if (
                event.key !== "Enter" ||
                event.isComposing ||
                event.keyCode === 229 ||
                event.shiftKey ||
                event.altKey ||
                !(event.metaKey || event.ctrlKey)
              )
                return;
              event.preventDefault();
              if (!event.repeat) event.currentTarget.form?.requestSubmit();
            }}
            disabled={busy || !!snapshot.mcpUncertainty}
          ></Textarea>
          {#if busy}<div class="composer-progress" role="status">
              <LoaderCircle size={14} class="animate-spin" aria-hidden="true" />
              <span
                >{snapshot.status === "cancelling"
                  ? "Stopping…"
                  : "Responding…"}</span
              >
            </div>
            <Button
              variant="outline"
              size="icon"
              type="button"
              class="stop-button"
              aria-label="Stop"
              title="Stop"
              onclick={() => action("stop")}
              disabled={snapshot.status === "cancelling"}
              ><Square size={12} fill="currentColor" /></Button
            >
          {:else}<Button
              type="submit"
              class="send-button"
              aria-label="Send message"
              title="Send message (⌘/Ctrl+Enter)"
              disabled={sending || !draft.trim() || !!snapshot.mcpUncertainty}
              ><ArrowUp size={20} /></Button
            >{/if}
        </div>
      </form>{:else}<div class="workspace-empty">
        <h1>What’s on your mind?</h1>
        <p class="muted">Start a conversation with your default model.</p>
        <Button
          class="primary"
          disabled={creating || loading}
          onclick={startCreation}
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

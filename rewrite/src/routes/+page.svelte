<script lang="ts">
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
  let current = "";
  let snapshot: ConversationSnapshot | undefined;
  let draft = "";
  let error = "";
  let connection = "Connecting";
  let creating = false;
  let source: any;
  let stream: EventSource | undefined;
  let validSources = new Set<string>();
  let generation = 0;
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
      const next = await api(`/api/conversations/${id}`);
      if (!active(own, id)) return;
      snapshot = next;
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
        snapshot = JSON.parse(event.data).snapshot;
        void validateCitations();
      };
      await validateCitations();
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
      const next = await api(`/api/conversations/${id}`);
      if (active(own, id)) snapshot = next;
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
      const next = await api(`/api/conversations/${id}`);
      if (active(own, id)) snapshot = next;
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
        modelId = settings.chat.modelId;
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
<div class="shell">
  <aside class="sidebar">
    <div class="brand">◈ Chat Ollama</div>
    <button class="primary" onclick={() => (creating = true)}
      >New conversation</button
    >
    <nav aria-label="Conversations">
      {#each conversations as conversation, i}<button
          class:active={current === conversation.id}
          onclick={() => open(conversation.id)}
          >Conversation {i + 1}<span class="muted">
            · {conversation.config.modelId}</span
          ></button
        >{/each}
    </nav>
    <a href="/settings">Settings</a><span class="muted"
      >Your private workspace</span
    >
  </aside>
  <main class="main">
    <header class="topbar">
      <strong>{current ? "Conversation" : "A little space to think"}</strong
      ><span class="status"
        >{current ? connection : "Private · persistent"}</span
      >
    </header>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if creating}<section class="empty card stack">
        <h1>New conversation</h1>
        <label>Model ID<input bind:value={modelId} /></label>
        <div>
          <h3>Knowledge collections</h3>
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
        <div>
          <h3>MCP servers</h3>
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
        <div class="row">
          <button class="primary" onclick={create}>Create conversation</button
          ><button onclick={() => (creating = false)}>Cancel</button>
        </div>
      </section>
    {:else if snapshot}
      {#if snapshot.status === "failed"}
        <p class="error" role="status">
          Run failed. Check your model settings, then send a new message.
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
        <label for="message" class="muted">Message</label><textarea
          id="message"
          bind:value={draft}
          placeholder="Ask anything…"
          disabled={busy || !!snapshot.mcpUncertainty}></textarea>
        <div class="row">
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
              >Send message</button
            >{/if}<span class="muted"
            >Work continues when you close this browser. Use Stop to cancel.</span
          >
        </div>
      </form>{:else}<div class="empty">
        <h1>Make room for a good question.</h1>
        <p class="muted">
          Create a conversation to get started. Models, knowledge and tools stay
          under your control.
        </p>
      </div>{/if}
  </main>
</div>
{#if source}<aside class="source" aria-label="Source excerpt">
    <button onclick={() => (source = undefined)}>Close source</button>
    <h2>{source.title}</h2>
    {#if source.page}<p class="muted">Page {source.page}</p>{/if}
    <p style="white-space:pre-wrap">{source.text}</p>
    <p class="muted">Source: {source.sourceId}</p>
  </aside>{/if}

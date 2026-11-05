<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/client";
  let settings: any;
  let keys = { chat: "", embedding: "" };
  let clear = { chat: false, embedding: false };
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
  async function save(kind: "chat" | "embedding") {
    await run(
      async () => {
        const value = settings[kind];
        const patch: any = { baseUrl: value.baseUrl, modelId: value.modelId };
        if (clear[kind]) patch.apiKey = "";
        else if (keys[kind]) patch.apiKey = keys[kind];
        settings = await api("/api/settings", { [kind]: patch });
        keys[kind] = "";
        clear[kind] = false;
        await loadCollections();
      },
      kind === "embedding"
        ? "Embedding settings saved. Reindex collections explicitly before searching with the new configuration."
        : "Chat settings saved",
    );
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
    <div class="grid">
      {#if settings}{#each ["chat", "embedding"] as kind}{@const k = kind as
            "chat" | "embedding"}
          <form
            class="card stack"
            onsubmit={(e) => {
              e.preventDefault();
              void save(k);
            }}
          >
            <h3>{k === "chat" ? "Chat" : "Embedding"} endpoint</h3>
            <label
              >{k === "chat" ? "Chat" : "Embedding"} base URL<input
                bind:value={settings[k].baseUrl}
                required
                type="url"
              /></label
            ><label
              >{k === "chat" ? "Chat" : "Embedding"} model ID<input
                bind:value={settings[k].modelId}
                required
              /></label
            ><label
              >{k === "chat" ? "Chat" : "Embedding"} API key<input
                type="password"
                bind:value={keys[k]}
                autocomplete="new-password"
                placeholder={settings[k].hasApiKey
                  ? "Key saved · leave blank to keep"
                  : "Optional API key"}
              /></label
            ><label class="check"
              ><input type="checkbox" bind:checked={clear[k]} />Remove saved API
              key</label
            >
            <p class="muted">
              {k === "chat"
                ? "Used for new conversations and subsequent messages."
                : "Independent of chat. Changes require an explicit collection reindex."}
            </p>
            <button class="primary">Save {k} settings</button>
          </form>{/each}{/if}
    </div>
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

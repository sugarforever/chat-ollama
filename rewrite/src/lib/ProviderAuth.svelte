<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "./client";
  export let id: string;
  export let mode: string;
  export let service = "";
  export let beforeConnect: () => Promise<unknown> = async () => {};
  let status: any;
  let error = "";
  let value = "";
  let promptId = "";
  let busy = false;
  let refreshing = false;
  let generation = 0;
  let loginRequested = false;
  let loginMethod = "browser";
  let loginWindow: Window | null = null;
  let openedUrl = "";
  let popupBlocked = false;
  const answeredPrompts = new Set<string>();
  const browserMethod = (prompt: any) =>
    loginRequested &&
    service === "openai-codex" &&
    prompt?.type === "select" &&
    prompt.options.some((option: any) => option.id === loginMethod);
  function closeLoginWindow() {
    // A provider may isolate its page; only the still-local preparation window is ours to close.
    if (loginWindow && !openedUrl) loginWindow.close();
    loginWindow = null;
  }
  async function receive(next: any, current = generation): Promise<void> {
    if (current !== generation) return;
    status = next;
    if (!loginRequested) return;
    if (next.flow?.status === "pending") {
      const prompt = next.flow.prompt;
      if (browserMethod(prompt) && !answeredPrompts.has(prompt.id)) {
        answeredPrompts.add(prompt.id);
        try {
          const nextStatus = await api(`/api/providers/${id}/auth`, {
            action: "answer",
            flowId: next.flow.id,
            promptId: prompt.id,
            value: loginMethod,
          });
          if (current === generation) {
            error = "";
            await receive(nextStatus, current);
          }
        } catch (e) {
          answeredPrompts.delete(prompt.id);
          if (current === generation) error = (e as Error).message;
        }
        return;
      }
      const event = [...next.flow.events]
        .reverse()
        .find(
          (event: any) =>
            event.type === "auth_url" || event.type === "device_code",
        );
      const url =
        event &&
        safe(event.type === "auth_url" ? event.url : event.verificationUri);
      if (url && url !== openedUrl) {
        if (loginWindow && !loginWindow.closed) {
          openedUrl = url;
          loginWindow.location.href = url;
        } else popupBlocked = true;
      }
    } else {
      closeLoginWindow();
      loginRequested = false;
    }
  }
  $: if (status?.flow?.prompt?.id !== promptId) {
    promptId = status?.flow?.prompt?.id ?? "";
    value =
      status?.flow?.prompt?.type === "select"
        ? (status.flow.prompt.options[0]?.id ?? "")
        : "";
  }
  async function refresh() {
    if (busy || refreshing) return;
    refreshing = true;
    const current = generation;
    try {
      const next = await api(`/api/providers/${id}/auth`);
      if (current === generation) await receive(next, current);
    } catch (e) {
      if (current === generation && loginRequested)
        error = (e as Error).message;
    } finally {
      refreshing = false;
    }
  }
  async function command(action: string, method = "browser") {
    error = "";
    const current = ++generation;
    busy = true;
    if (action === "start" && mode === "oauth") {
      closeLoginWindow();
      loginRequested = true;
      loginMethod = method;
      openedUrl = "";
      popupBlocked = false;
      answeredPrompts.clear();
      // Open during the click, before saving or fetching the authorization URL.
      loginWindow = window.open("about:blank", "_blank");
      if (loginWindow) {
        loginWindow.opener = null;
        loginWindow.document.title = "Connecting account…";
        loginWindow.document.body.textContent =
          "Preparing secure sign-in. This window will continue to your provider automatically.";
      } else popupBlocked = true;
    }
    try {
      if (action === "start") await beforeConnect();
      if (current !== generation) return;
      await receive(
        await api(`/api/providers/${id}/auth`, {
          action,
          type: mode,
          ...(action === "answer"
            ? { flowId: status.flow.id, promptId: status.flow.prompt.id, value }
            : {}),
        }),
        current,
      );
      value = "";
    } catch (e) {
      if (current !== generation) return;
      error = (e as Error).message;
      if (action === "start") {
        closeLoginWindow();
        loginRequested = false;
      }
    } finally {
      if (current === generation) busy = false;
    }
  }
  const safe = (url: string) => (/^https?:\/\//.test(url) ? url : undefined);
  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      clearInterval(timer);
      generation++;
      loginRequested = false;
      if (!openedUrl) closeLoginWindow();
    };
  });
</script>

<div class="stack">
  <p class="muted">
    Connecting saves the current provider settings first. {mode === "ambient"
      ? "Uses credentials configured on the server."
      : status?.connected
        ? "Credentials saved on the server."
        : "Not connected."}
  </p>
  {#if mode !== "ambient"}
    <div class="row">
      <button
        type="button"
        disabled={busy || status?.flow?.status === "pending"}
        onclick={() => command("start")}
        >{mode === "oauth"
          ? "Connect account"
          : "Guided credential setup"}</button
      ><button
        type="button"
        disabled={busy}
        onclick={() => command("disconnect")}>Disconnect</button
      >
    </div>
  {/if}
  {#if status?.expiresAt}<p class="muted">
      Token refreshes automatically when needed.
    </p>{/if}
  {#if status?.flow?.status === "pending"}
    {#if mode === "oauth"}<p class="muted" role="status">
        {popupBlocked
          ? "The sign-in window could not be opened. Use the login link below to continue."
          : "Complete sign-in in the opened window. Your connection updates automatically."}
      </p>{/if}
    {#each status.flow.events as event}
      {#if event.type === "auth_url"}<a
          href={safe(event.url)}
          target="_blank"
          rel="noreferrer">Open official login</a
        >
        {#if mode !== "oauth"}<p>{event.instructions ?? ""}</p>{/if}
      {:else if event.type === "device_code"}<a
          href={safe(event.verificationUri)}
          target="_blank"
          rel="noreferrer">Open device login</a
        >
        <p>Device code: <strong>{event.userCode}</strong></p>
      {:else}<p>{event.message}</p>
        {#each event.links ?? [] as link}<a
            href={safe(link.url)}
            target="_blank"
            rel="noreferrer">{link.label ?? "Official instructions"}</a
          >{/each}{/if}
    {/each}
    {#if status.flow.prompt && !browserMethod(status.flow.prompt)}
      {#if status.flow.prompt.type === "manual_code" && mode === "oauth"}
        <details>
          <summary>Having trouble signing in?</summary>
          <p class="muted">
            If automatic sign-in cannot finish, paste the redirect URL from your
            sign-in window.
          </p>
          <label
            >{status.flow.prompt.message}<input
              type="password"
              bind:value
              autocomplete="off"
              placeholder={status.flow.prompt.placeholder ?? ""}
            /></label
          >
          <button
            type="button"
            disabled={busy}
            onclick={() => command("answer")}>Submit redirect URL</button
          >
          {#if service === "openai-codex"}<button
              type="button"
              disabled={busy}
              onclick={() => command("start", "device_code")}
              >Use device code instead</button
            >{/if}
        </details>
      {:else}
        <label
          >{status.flow.prompt.message}
          {#if status.flow.prompt.type === "select"}<select
              aria-label={status.flow.prompt.message}
              bind:value
              >{#each status.flow.prompt.options as option}<option
                  value={option.id}>{option.label}</option
                >{/each}</select
            >
          {:else}<input
              type={status.flow.prompt.type === "secret" ||
              status.flow.prompt.type === "manual_code"
                ? "password"
                : "text"}
              bind:value
              placeholder={status.flow.prompt.placeholder ?? ""}
              autocomplete="off"
            />{/if}
        </label><button
          type="button"
          disabled={busy}
          onclick={() => command("answer")}>Continue login</button
        >
      {/if}
    {/if}
    <button type="button" disabled={busy} onclick={() => command("cancel")}
      >Cancel login</button
    >
  {:else if status?.flow?.status === "failed" || status?.flow?.status === "cancelled"}<p
      role="status"
    >
      {status.flow.message ?? "Login cancelled."}
    </p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

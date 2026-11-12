<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "./client";
  export let id: string;
  export let mode: string;
  let status: any;
  let error = "";
  let value = "";
  let promptId = "";
  let busy = false;
  $: if (status?.flow?.prompt?.id !== promptId) {
    promptId = status?.flow?.prompt?.id ?? "";
    value =
      status?.flow?.prompt?.type === "select"
        ? (status.flow.prompt.options[0]?.id ?? "")
        : "";
  }
  async function refresh() {
    try {
      status = await api(`/api/providers/${id}/auth`);
    } catch {}
  }
  async function command(action: string) {
    error = "";
    busy = true;
    try {
      status = await api(`/api/providers/${id}/auth`, {
        action,
        type: mode,
        ...(action === "answer"
          ? { flowId: status.flow.id, promptId: status.flow.prompt.id, value }
          : {}),
      });
      value = "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  const safe = (url: string) => (/^https?:\/\//.test(url) ? url : undefined);
  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  });
</script>

<div class="stack">
  <p class="muted">
    Save provider settings before connecting. {mode === "ambient"
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
    {#each status.flow.events as event}
      {#if event.type === "auth_url"}<a
          href={safe(event.url)}
          target="_blank"
          rel="noreferrer">Open official login</a
        >
        <p>{event.instructions ?? ""}</p>
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
    {#if status.flow.prompt}
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
    <button type="button" onclick={() => command("cancel")}>Cancel login</button
    >
  {:else if status?.flow?.status === "failed" || status?.flow?.status === "cancelled"}<p
      role="status"
    >
      {status.flow.message ?? "Login cancelled."}
    </p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

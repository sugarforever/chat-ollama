<script lang="ts">
  let password = "";
  let error = "";
  let busy = false;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) location.href = "/";
      else error = "Login failed. Check your password or try again later.";
    } catch {
      error = "Unable to connect. Try again.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Log in · Chat Ollama</title></svelte:head>
<main class="login card stack">
  <div class="brand">◈ Chat Ollama</div>
  <h1>Welcome back.</h1>
  <p class="muted">Your private place for conversations and knowledge.</p>
  <form class="stack" onsubmit={submit}>
    <label
      >Password<input
        type="password"
        bind:value={password}
        autocomplete="current-password"
        required
      /></label
    ><button class="primary" disabled={busy}
      >{busy ? "Logging in…" : "Log in"}</button
    >
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</main>

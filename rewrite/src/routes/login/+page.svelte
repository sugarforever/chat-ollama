<script lang="ts">
  import AppIcon from "$lib/AppIcon.svelte";
  let password = "";
  let error = "";
  let busy = false;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = "";
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
<main class="login-page">
  <div class="login-brand brand">
    <span class="brand-symbol"><AppIcon /></span>Chat Ollama
  </div>
  <section class="login card stack">
    <div class="login-icon"><AppIcon name="lock" size={24} /></div>
    <div>
      <span class="eyebrow">YOUR PRIVATE WORKSPACE</span>
      <h1>Welcome back.</h1>
      <p class="muted">Sign in to your conversations, models and knowledge.</p>
    </div>
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
  </section>
  <p class="login-footer">Your models. Your knowledge. Your workspace.</p>
</main>

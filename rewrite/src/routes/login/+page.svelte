<script lang="ts">
  import { Eye, EyeOff } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  let showPassword = false;
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
  <section class="login stack">
    <h1>ChatOllama</h1>
    <form class="stack" onsubmit={submit}>
      <label for="password">Password</label>
      <div class="password-field">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          bind:value={password}
          autocomplete="current-password"
          aria-invalid={!!error}
          aria-describedby={error ? "login-error" : undefined}
          required
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={showPassword ? "Hide password" : "Show password"}
          data-tip={showPassword ? "Hide password" : "Show password"}
          onclick={() => (showPassword = !showPassword)}
          >{#if showPassword}<EyeOff size={18} />{:else}<Eye
              size={18}
            />{/if}</Button
        >
      </div>
      {#if error}<p id="login-error" class="error" role="alert">{error}</p>{/if}
      <Button type="submit" disabled={busy}
        >{busy ? "Signing in…" : "Sign in"}</Button
      >
    </form>
  </section>
</main>

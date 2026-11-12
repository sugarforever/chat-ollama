<script lang="ts">
  import { page } from "$app/stores";
  import AppIcon from "$lib/AppIcon.svelte";
</script>

<svelte:head><title>{$page.status} · Chat Ollama</title></svelte:head>
<main class="error-page">
  <section>
    <span class="eyebrow">CHAT OLLAMA / {$page.status}</span>
    <h1>
      {$page.status === 404 ? "This page isn’t here." : "Something went wrong."}
    </h1>
    <p class="muted">
      {$page.status === 404
        ? "The link may have changed. Your conversations are waiting in your workspace."
        : "Try opening your workspace again. Your saved conversations are still there."}
    </p>
    <a href="/" class="button primary"
      >Back to workspace<AppIcon name="arrow" size={16} /></a
    >
  </section>
</main>

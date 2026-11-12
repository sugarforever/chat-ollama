<script lang="ts">
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/button/button.svelte";
</script>

<svelte:head><title>Settings · {$page.status} · Chat Ollama</title></svelte:head
>
<main class="error-page">
  <section>
    <span class="eyebrow">SETTINGS / {$page.status}</span>
    <h1>
      {$page.status === 404
        ? "This connection or page isn’t here."
        : "Unable to load Settings."}
    </h1>
    <p class="muted">Return to your saved connections and try again.</p>
    <Button href="/settings/providers">Back to providers</Button>
  </section>
</main>

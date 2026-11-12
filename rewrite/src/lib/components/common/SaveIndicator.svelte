<script lang="ts">
  import { Check, LoaderCircle, RotateCw } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  let {
    state,
    onretry,
    hint = "Changes save automatically.",
  }: {
    state: string;
    onretry: () => void;
    hint?: string;
  } = $props();
</script>

<div
  class="save-indicator"
  class:failed={state === "error"}
  role="status"
  aria-live="polite"
  title={hint}
>
  {#if state === "saving"}<LoaderCircle size={14} class="animate-spin" />Saving…
  {:else if state === "pending"}<LoaderCircle
      size={14}
      class="animate-spin"
    />Waiting to save…
  {:else if state === "saved"}<Check size={14} class="saved-check" />Saved
  {:else if state === "error"}Couldn’t save<Button
      variant="ghost"
      size="icon"
      aria-label="Retry saving"
      data-tip="Retry saving"
      onclick={onretry}><RotateCw size={14} /></Button
    >
  {/if}
</div>

<script lang="ts">
  import type { ModelLimits } from './contracts';
  import Input from '$lib/components/ui/input/input.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  export let provider: { id: string; modelId: string; modelLimits?: Record<string, ModelLimits> };
  export let catalog: { id: string; contextWindow: number; maxTokens: number }[] = [];
  export let onchange: () => void;
  let modelId = provider.modelId;
  let previousDefault = provider.modelId;
  let contextWindow: number | undefined;
  let maxTokens: number | undefined;
  let error = '';
  $: if (provider.modelId !== previousDefault) { previousDefault = provider.modelId; modelId = provider.modelId; }
  $: native = catalog.find(m => m.id === modelId);
  $: override = provider.modelLimits && Object.hasOwn(provider.modelLimits, modelId) ? provider.modelLimits[modelId] : undefined;
  $: { modelId; contextWindow = native?.contextWindow ?? override?.contextWindow ?? 32768; maxTokens = native?.maxTokens ?? override?.maxTokens ?? 4096; error = ''; }
  function apply() {
    if (!modelId.trim() || modelId.length > 200 || !Number.isSafeInteger(contextWindow) || !contextWindow || contextWindow <= 0 || !Number.isSafeInteger(maxTokens) || !maxTokens || maxTokens <= 0 || maxTokens > contextWindow) {
      error = 'Use positive whole token counts; output must fit within the context window.';
      return;
    }
    provider.modelLimits = { ...provider.modelLimits, [modelId]: { contextWindow, maxTokens } };
    onchange();
  }
  function reset() {
    const next = { ...provider.modelLimits }; delete next[modelId];
    provider.modelLimits = next; onchange();
  }
</script>
<div class="space-y-3 border-t pt-4">
  <h3>Model limits</h3>
  <label class="block">Limits model ID<Input bind:value={modelId} aria-label="Limits model ID" /></label>
  <p class="text-sm text-muted-foreground">{native ? 'Source: native catalog. These limits are managed by the provider catalog.' : override ? 'Source: custom configuration.' : 'Source: compatible defaults. Set the actual limits supported by your endpoint.'}</p>
  <label class="block">Context window (tokens)<Input type="number" min="1" step="1" disabled={!!native} bind:value={contextWindow} aria-label="Context window (tokens)" /></label>
  <label class="block">Maximum output (tokens)<Input type="number" min="1" step="1" disabled={!!native} bind:value={maxTokens} aria-label="Maximum output (tokens)" /></label>
  {#if !native}
    <div class="flex gap-2"><Button variant="outline" onclick={apply}>Apply model limits</Button>{#if override}<Button variant="ghost" onclick={reset}>Use default limits</Button>{/if}</div>
    <p class="text-sm text-muted-foreground">Saved per model ID for this connection. Apply limits before switching the ID. Changes affect the next run.</p>
  {/if}
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
</div>

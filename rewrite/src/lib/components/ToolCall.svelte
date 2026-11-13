<script lang="ts">
  import { smoothDisclosure } from '$lib/disclosure';
  import { ChevronDown, SquareTerminal, Wrench, LoaderCircle } from '@lucide/svelte';
  import type { PublicEntry } from '$lib/contracts';
  import { toolLabel } from '$lib/tool-activity';
  export let entry: PublicEntry;
  $: shell = entry.toolName === 'bash';
  $: running = entry.toolStatus === 'running' || entry.toolStatus === 'pending';
</script>

<article class="entry tool">
  <details use:smoothDisclosure class="tool-call" class:tool-error={entry.toolError}>
    <summary>
      {#if running}<LoaderCircle size={16} class="animate-spin" />{:else if shell}<SquareTerminal size={16} />{:else}<Wrench size={16} />{/if}
      <span class="tool-preview">{toolLabel(entry)}</span>
      {#if entry.uncertain}<span class="tool-uncertain">Uncertain</span>{/if}
      <ChevronDown size={16} class="disclosure-chevron" />
    </summary>
    <div class="tool-console">
      <span class="tool-console-title">{shell ? 'Shell' : entry.toolName ?? 'Tool'}</span>
      {#if entry.toolArguments}
        <pre class="tool-input">{shell && typeof entry.toolArguments.command === 'string' ? `$ ${entry.toolArguments.command}` : JSON.stringify(entry.toolArguments, null, 2)}</pre>
        {#if shell}
          {#each Object.entries(entry.toolArguments).filter(([key]) => key !== 'command') as [key, value]}
            <span class="tool-option">{key}: {JSON.stringify(value)}</span>
          {/each}
        {/if}
      {/if}
      {#if entry.content}<pre class="tool-output">{entry.content}</pre>{:else}<p class="tool-empty">{running ? 'Waiting for output…' : 'No output'}</p>{/if}
    </div>
  </details>
</article>

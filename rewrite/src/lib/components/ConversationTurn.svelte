<script lang="ts">
  import { ChevronDown, SquareTerminal, LoaderCircle } from '@lucide/svelte';
  import { activityBlocks, type ConversationTurn } from '$lib/tool-activity';
  import ToolCall from './ToolCall.svelte';
  export let turn: ConversationTurn;
  export let render: (content: string, allowed: Set<string>) => string;
  export let validSources: Set<string>;
  $: blocks = activityBlocks(turn.activity);
  $: tools = turn.activity.filter(entry => entry.kind === 'tool');
</script>

{#if turn.user}
  <article class="entry user"><strong class="role">You</strong><div>{@html render(turn.user.content, validSources)}</div></article>
{/if}
{#if tools.length}
  <details class="turn-activity" open>
    <summary class="work-summary">
      <span>{turn.active ? 'Working…' : turn.durationSeconds ? `Worked for ${turn.durationSeconds}s` : 'Worked'}</span>
      <ChevronDown size={16} class="disclosure-chevron" />
      <span class="activity-count">{tools.length} {tools.length === 1 ? 'tool call' : 'tool calls'}</span>
    </summary>
    <div class="activity-history">
      {#each blocks as block (block.id)}
        {#if block.kind === 'tools'}
          <details class="tool-group" open>
            <summary>
              {#if block.entries.some(entry => entry.toolStatus !== 'done')}<LoaderCircle size={16} class="animate-spin" />{:else}<SquareTerminal size={16} />{/if}
              <span>{block.entries.every(entry => entry.toolName === 'bash') ? (block.entries.some(entry => entry.toolStatus !== 'done') ? 'Running commands' : 'Ran commands') : 'Tool calls'}</span>
              <ChevronDown size={16} class="disclosure-chevron" />
            </summary>
            <div class="tool-history">
              {#each block.entries as entry (entry.id)}<ToolCall {entry} />{/each}
            </div>
          </details>
        {:else}
          {#each block.entries as entry (entry.id)}<article class="entry assistant"><div>{@html render(entry.content, validSources)}</div></article>{/each}
        {/if}
      {/each}
    </div>
  </details>
{:else}
  {#each turn.activity as entry (entry.id)}<article class="entry assistant"><div>{@html render(entry.content, validSources)}</div></article>{/each}
{/if}
{#if turn.answer}
  <article class="entry assistant"><strong class="role">Assistant</strong><div>{@html render(turn.answer.content, validSources)}</div>{#if turn.answer.partial}<span class="muted">Writing…</span>{/if}</article>
{/if}

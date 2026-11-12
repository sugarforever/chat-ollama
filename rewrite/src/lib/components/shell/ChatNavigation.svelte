<script lang="ts">
  import { Dialog } from "bits-ui";
  import { Menu, SquarePen, Settings, X } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  let {
    conversations,
    current,
    onselect,
    onnew,
  }: {
    conversations: { id: string }[];
    current: string;
    onselect: (id: string) => void;
    onnew: (trigger: HTMLElement) => void;
  } = $props();
  let open = $state(false);
</script>

{#snippet navigation()}
  <div class="sidebar-heading">
    <a href="/" class="brand">ChatOllama</a>
    <Button
      variant="ghost"
      size="icon"
      aria-label="New conversation"
      data-tip="New conversation"
      onclick={(event) => {
        const trigger = open
          ? (document.getElementById("history-trigger") as HTMLButtonElement)
          : event.currentTarget;
        open = false;
        onnew(trigger);
      }}><SquarePen size={18} /></Button
    >
  </div>
  <nav aria-label="Conversations" class="conversation-list">
    {#each conversations as conversation, i (conversation.id)}
      <a
        href={`/?conversation=${encodeURIComponent(conversation.id)}`}
        class:active={current === conversation.id}
        aria-current={current === conversation.id ? "page" : undefined}
        onclick={(event) => {
          if (
            event.button ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          open = false;
          onselect(conversation.id);
        }}
      >
        <span class="truncate">Conversation {i + 1}</span>
      </a>
    {:else}<p class="muted">No conversations yet</p>{/each}
  </nav>
  <div class="sidebar-footer">
    <a href="/settings"><Settings size={18} />Settings</a>
  </div>
{/snippet}

<aside class="sidebar desktop-history" aria-label="Conversation navigation">
  {@render navigation()}
</aside>
<Dialog.Root bind:open>
  <Dialog.Trigger
    id="history-trigger"
    class="mobile-history icon-button"
    aria-label="Open conversations"
    title="Open conversations"><Menu size={20} /></Dialog.Trigger
  >
  <Dialog.Portal>
    <Dialog.Overlay class="drawer-overlay" />
    <Dialog.Content class="history-drawer">
      <Dialog.Title class="sr-only">Conversations</Dialog.Title>
      <Dialog.Description class="sr-only"
        >Choose a conversation or start a new one.</Dialog.Description
      >
      <Dialog.Close
        class="drawer-close icon-button"
        aria-label="Close conversations"><X size={18} /></Dialog.Close
      >
      {@render navigation()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

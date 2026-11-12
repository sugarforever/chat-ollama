<script lang="ts">
  import { MessageCircle, Plus, Settings, ArrowRight, X, Send, Lock, BookOpen, Wrench, ChevronRight } from "@lucide/svelte";
  export let name = "chat";
  export let size = 18;
  const icons = {
    chat: MessageCircle,
    plus: Plus,
    settings: Settings,
    arrow: ArrowRight,
    close: X,
    send: Send,
    lock: Lock,
    book: BookOpen,
    tools: Wrench,
    chevron: ChevronRight,
  };
</script>

<svelte:component this={icons[name as keyof typeof icons] ?? MessageCircle} {size} strokeWidth={1.6} aria-hidden="true" class="shrink-0 align-middle" />

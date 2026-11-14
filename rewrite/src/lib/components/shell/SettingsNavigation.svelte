<script lang="ts">
  import {
    ArrowLeft,
    Cpu,
    Binary,
    Library,
    Plug,
    BookOpen,
  } from "@lucide/svelte";
  let { active }: { active: string } = $props();
  const items = [
    { id: "providers", name: "Providers", icon: Cpu },
    { id: "embeddings", name: "Embeddings", icon: Binary },
    { id: "knowledge", name: "Knowledge", icon: Library },
    { id: "skills", name: "Skills", icon: BookOpen },
    { id: "tools", name: "MCP servers", icon: Plug },
  ];
</script>

<aside class="settings-navigation">
  <a class="settings-back" href="/"
    ><ArrowLeft size={18} />Back to conversations</a
  >
  <nav aria-label="Settings categories">
    {#each items as item}<a
        href={`/settings/${item.id}`}
        class:active={active === item.id}
        aria-current={active === item.id ? "page" : undefined}
        ><item.icon size={18} /><span>{item.name}</span></a
      >{/each}
  </nav>
</aside>

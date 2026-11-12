<script lang="ts">
  import {
    ArrowLeft,
    Cpu,
    Binary,
    Library,
    Plug,
    LogOut,
  } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  let { active, onlogout }: { active: string; onlogout: () => void } = $props();
  const items = [
    { id: "providers", name: "Providers", icon: Cpu },
    { id: "embeddings", name: "Embeddings", icon: Binary },
    { id: "knowledge", name: "Knowledge", icon: Library },
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
  <Button variant="ghost" class="settings-logout" onclick={onlogout}
    ><LogOut size={18} />Log out</Button
  >
</aside>

<script lang="ts">
  import { Popover } from "bits-ui";
  import { BookOpen, LoaderCircle } from "@lucide/svelte";
  import { onDestroy } from "svelte";
  import { api } from "$lib/client";
  import { buttonVariants } from "$lib/components/ui/button/button.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import type { InstalledSkill } from "$lib/skills";

  let { conversationId, busy = false }: { conversationId: string; busy?: boolean } = $props();
  let open = $state(false);
  let installed = $state<InstalledSkill[]>([]);
  let excluded = $state<string[]>([]);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);
  let ready = $state(false);
  let disposed = false;
  let revision = 0;
  onDestroy(() => { disposed = true; revision++; });
  const available = $derived(installed.filter(skill => !excluded.includes(skill.id)).length);
  async function load() {
    const own = ++revision;
    loading = true;
    error = "";
    saved = false;
    try {
      const value = await api(`/api/conversations/${conversationId}/skills`);
      if (disposed || own !== revision) return;
      installed = value.installed;
      excluded = value.excludedSkillIds;
      ready = true;
    } catch (e) {
      if (!disposed && own === revision) { error = (e as Error).message; ready = false; }
    } finally {
      if (!disposed && own === revision) loading = false;
    }
  }
  async function toggle(id: string, enabled: boolean) {
    if (saving || loading || busy) return;
    const own = ++revision;
    saving = true;
    error = "";
    saved = false;
    const previous = excluded;
    const next = enabled ? excluded.filter(value => value !== id) : [...excluded, id];
    excluded = next;
    try {
      const value = await api(`/api/conversations/${conversationId}/skills`, { excludedSkillIds: next }, "PATCH");
      if (disposed || own !== revision) return;
      installed = value.installed;
      excluded = value.excludedSkillIds;
      saved = true;
    } catch (e) {
      if (!disposed && own === revision) { excluded = previous; error = (e as Error).message; }
    } finally {
      if (!disposed && own === revision) saving = false;
    }
  }
</script>

<Popover.Root bind:open onOpenChange={(value) => { if (value && !saving) void load(); }}>
  <Popover.Trigger data-slot="button" class={`${buttonVariants({ variant: "ghost" })} skills-trigger`} aria-label="Conversation skills" title="Conversation skills">
    <BookOpen size={16} /><span>Skills</span>
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="skills-popover" role="dialog" aria-label="Conversation skills" sideOffset={8} align="end" collisionPadding={8}>
      <div class="skills-heading"><h2>Conversation skills</h2>{#if ready && !loading}<span>{available} of {installed.length} available</span>{/if}</div>
      <p class="skills-note">Global skills are available by default. Turn off a skill to exclude it from this conversation.</p>
      {#if loading}<p class="skills-status" role="status"><LoaderCircle size={14} class="animate-spin" />Loading skills…</p>
      {:else if ready}
        {#if installed.length}
          <div class="skills-list" aria-busy={saving}>
            {#each installed as skill (skill.id)}
              <label class="skill-row" class:excluded={excluded.includes(skill.id)}>
                <input type="checkbox" aria-label={`Use ${skill.name}`} checked={!excluded.includes(skill.id)} disabled={saving || busy} onchange={(event) => void toggle(skill.id, event.currentTarget.checked)} />
                <span class="skill-copy"><span class="skill-title">{skill.name}<span class="skill-state">{excluded.includes(skill.id) ? "Excluded" : "Available"}</span></span><span class="skill-description">{skill.description}</span></span>
              </label>
            {/each}
          </div>
        {:else}<p class="skills-empty">No global skills installed yet.</p>{/if}
        <p class="skills-status" role="status">{busy ? "Finish the response and queued messages before changing skills." : saving ? "Saving…" : saved ? "Saved. Changes apply to the next message." : "Changes apply to the next message."}</p>
      {/if}
      {#if error}<p class="skills-error" role="alert">{error}</p>{#if !ready}<Button variant="outline" size="sm" onclick={load}>Retry</Button>{/if}{/if}
      <div class="skills-footer"><a href="/settings/skills">Manage global skills</a></div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.skills-trigger) { gap: 6px; flex-shrink: 0; }
  :global(.skills-popover) { z-index: 50; width: min(400px, calc(100vw - 24px)); max-height: min(560px, calc(100dvh - 88px)); overflow-y: auto; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); box-shadow: 0 12px 36px #00000018; }
  .skills-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .skills-heading > span { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .skills-note, .skills-status, .skills-empty { font-size: 12px; line-height: 1.5; color: var(--muted); }
  .skills-note { margin: 8px 0 12px; }
  .skills-list { border-top: 1px solid var(--border); }
  .skill-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); cursor: pointer; min-height: 44px; }
  input { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--accent); cursor: pointer; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .skill-copy { min-width: 0; flex: 1; }
  .skill-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
  .skill-state { color: var(--muted); font-size: 11px; font-weight: 400; flex-shrink: 0; }
  .skill-description { display: block; margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .excluded .skill-title { color: var(--muted); }
  .skills-status { display: flex; align-items: center; gap: 6px; margin: 12px 0; }
  .skills-error { font-size: 12px; color: var(--destructive); margin: 8px 0; }
  .skills-footer { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px; }
  .skills-footer a { font-size: 12px; color: var(--text); text-underline-offset: 3px; }
</style>

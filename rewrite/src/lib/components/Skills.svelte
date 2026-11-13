<script lang="ts">
  import { onMount } from "svelte";
  import {
    FolderOpen,
    Download,
    ExternalLink,
    Trash2,
    LoaderCircle,
  } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { api } from "$lib/client";
  import {
    skillCatalog,
    skillLimits,
    type InstalledSkill,
    type SkillDiscovery,
  } from "$lib/skills";
  let installed = $state<InstalledSkill[]>([]);
  let discovery = $state<SkillDiscovery>();
  let selected = $state<string[]>([]);
  let url = $state("");
  let busy = $state("");
  let error = $state("");
  let notice = $state("");
  let loading = $state(true);
  let remove = $state<InstalledSkill>();
  let confirmOpen = $state(false);
  async function refresh() {
    installed = (await api("/api/skills")).installed;
  }
  onMount(() => {
    void refresh()
      .catch((e) => (error = e.message))
      .finally(() => (loading = false));
  });
  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    busy = key;
    error = "";
    notice = "";
    try {
      await action();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Could not complete the skill request. Try again.";
    } finally {
      busy = "";
    }
  }
  async function folder(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    await run("folder", async () => {
      discovery = undefined;
      if (
        files.length > skillLimits.files ||
        files.reduce((n, f) => n + f.size, 0) > skillLimits.totalBytes ||
        files.some((f) => f.size > skillLimits.fileBytes)
      )
        throw Error(
          "Folder limit exceeded: up to 1,000 files, 20 MiB total and 5 MiB per file. Select a smaller skill folder.",
        );
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
        form.append("paths", file.webkitRelativePath || file.name);
      }
      discovery = await api("/api/skills/discover", form);
      selected = discovery!.skills.map((s) => s.path);
    });
    input.value = "";
  }
  async function repository(event: SubmitEvent) {
    event.preventDefault();
    await run("repository", async () => {
      discovery = undefined;
      discovery = await api("/api/skills/discover", { url: url.trim() });
      selected = discovery!.skills.map((s) => s.path);
    });
  }
  async function install() {
    const preview = discovery;
    if (!preview) return;
    await run("selection", async () => {
      const result: InstalledSkill[] = await api("/api/skills/install", {
        importId: preview.importId,
        paths: selected,
      });
      discovery = undefined;
      selected = [];
      await refresh();
      notice = `Installed ${result.length} skill${result.length === 1 ? "" : "s"}. Available on your next message.`;
    });
  }
  function alreadyInstalled(entry: (typeof skillCatalog)[number]) {
    const [repo, path] = entry.url.split("/tree/main/");
    return installed.some(
      (s) =>
        s.name === entry.id ||
        (s.source.startsWith(repo + "/tree/") && s.source.endsWith("/" + path)),
    );
  }
</script>

<section class="skills">
  <div>
    <h2>Skills</h2>
    <p class="muted">
      Give ChatOllama reusable instructions and tools for specific tasks.
      Installed skills are available to all conversations on the next message.
    </p>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="import-panel">
    <h3>Import skills</h3>
    <p class="muted">
      Choose one skill or a folder containing many skills. Each skill needs a
      SKILL.md file with a name and description.
    </p>
    <label class="folder-button" class:disabled={!!busy}>
      {#if busy === "folder"}<LoaderCircle
          size={16}
          class="animate-spin"
        />{:else}<FolderOpen size={16} />{/if}
      <span>{busy === "folder" ? "Finding skills…" : "Select folder"}</span>
      <input
        type="file"
        webkitdirectory
        multiple
        aria-label="Select skill folder"
        disabled={!!busy}
        onchange={folder}
      />
    </label>
    <form onsubmit={repository}>
      <label for="skill-repo">Public GitHub repository or folder URL</label>
      <div class="repo-row">
        <Input
          id="skill-repo"
          type="url"
          bind:value={url}
          required
          placeholder="https://github.com/owner/skills"
          disabled={!!busy}
        /><Button
          type="submit"
          variant="outline"
          disabled={!!busy || !url.trim()}
          >{busy === "repository" ? "Finding skills…" : "Find skills"}</Button
        >
      </div>
    </form>
    <p class="limits muted">
      Up to 100 skills · 1,000 files · 20 MiB total · 5 MiB per file
    </p>
  </div>
  {#if discovery}
    <div class="preview">
      <h3>
        Found {discovery.skills.length} skill{discovery.skills.length === 1
          ? ""
          : "s"}
      </h3>
      <p class="muted">
        Select the skills to install. Supporting files stay with each skill.
      </p>
      {#each discovery.skills as skill}
        <div class="candidate">
          <Checkbox
            id={`skill-${skill.path}`}
            aria-label={`Install ${skill.name}`}
            checked={selected.includes(skill.path)}
            disabled={!!busy}
            onCheckedChange={(checked) => {
              selected = checked
                ? [...selected, skill.path]
                : selected.filter((p) => p !== skill.path);
            }}
          />
          <label for={`skill-${skill.path}`}
            ><strong>{skill.name}</strong><span>{skill.description}</span><small
              >{skill.path || "Root folder"} · {skill.fileCount} file{skill.fileCount ===
              1
                ? ""
                : "s"}</small
            ></label
          >
        </div>
      {/each}
      <div class="actions">
        <Button disabled={!!busy || !selected.length} onclick={install}
          >{busy === "selection"
            ? "Installing…"
            : `Install selected (${selected.length})`}</Button
        ><Button
          variant="ghost"
          disabled={!!busy}
          onclick={() => (discovery = undefined)}>Cancel</Button
        >
      </div>
    </div>
  {/if}
  <div>
    <h3>Installed skills <span class="muted">{installed.length}</span></h3>
    {#if loading}<p class="muted">
        Loading skills…
      </p>{:else if !installed.length}<p class="empty muted">
        No skills installed yet. Import your own or choose a popular skill
        below.
      </p>{:else}
      <div class="installed-list">
        {#each installed as skill}<article class="installed-row">
            <div>
              <strong>{skill.name}</strong>
              <p>{skill.description}</p>
              {#if skill.source.startsWith("https://github.com/")}<a
                  href={skill.source}
                  target="_blank"
                  rel="noreferrer">View source <ExternalLink size={12} /></a
                >{:else}<small>{skill.source}</small>{/if}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${skill.name}`}
              disabled={!!busy}
              onclick={() => {
                remove = skill;
                confirmOpen = true;
              }}><Trash2 size={16} /></Button
            >
          </article>{/each}
      </div>
    {/if}
  </div>
  <div>
    <h3>Popular skills</h3>
    <p class="muted">
      Community skills from Anthropic and Vercel. Some need extra software or
      API keys to perform their tasks.
    </p>
    <div class="catalog">
      {#each skillCatalog as entry}<article class="catalog-card">
          <div class="card-top">
            <strong>{entry.name}</strong><small>{entry.publisher}</small>
          </div>
          <p>{entry.description}</p>
          <a href={entry.url} target="_blank" rel="noreferrer" class="catalog-source"
            >{entry.url.replace("https://github.com/", "")}
            <ExternalLink size={12} /></a
          >
          <Button
            variant="outline"
            disabled={!!busy || loading || alreadyInstalled(entry)}
            aria-label={`${alreadyInstalled(entry) ? "Installed" : "Install"} ${entry.name}`}
            onclick={() =>
              run(entry.id, async () => {
                const result: InstalledSkill[] = await api(
                  "/api/skills/install",
                  { catalogId: entry.id },
                );
                await refresh();
                notice = `Installed ${result.length} skill${result.length === 1 ? "" : "s"}. Available on your next message.`;
              })}
          >
            {#if busy === entry.id}<LoaderCircle
                size={14}
                class="animate-spin"
              />Installing…{:else if alreadyInstalled(entry)}Installed{:else}<Download
                size={14}
              />Install{/if}
          </Button>
        </article>{/each}
    </div>
  </div>
</section>
<AlertDialog.Root bind:open={confirmOpen}
  ><AlertDialog.Content>
    <AlertDialog.Header
      ><AlertDialog.Title>Remove {remove?.name}?</AlertDialog.Title
      ><AlertDialog.Description
        >This removes the installed skill and its supporting files. You can
        install it again from its source.</AlertDialog.Description
      ></AlertDialog.Header
    >
    <AlertDialog.Footer
      ><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><Button
        variant="destructive"
        disabled={!!busy}
        onclick={() =>
          run("remove", async () => {
            if (!remove) return;
            await api(`/api/skills/${remove.id}`, undefined, "DELETE");
            confirmOpen = false;
            await refresh();
            notice = "Skill removed.";
          })}>{busy === "remove" ? "Removing…" : "Remove skill"}</Button
      ></AlertDialog.Footer
    >
  </AlertDialog.Content></AlertDialog.Root
>

<style>
  .skills {
    display: grid;
    gap: 28px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }
  p {
    margin: 0 0 12px;
    line-height: 1.6;
  }
  .muted,
  small {
    color: var(--muted);
  }
  .import-panel,
  .preview {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .folder-button {
    display: inline-flex;
    position: relative;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--input);
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 20px;
  }
  .folder-button:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .folder-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    cursor: pointer;
  }
  .folder-button.disabled {
    opacity: 0.5;
  }
  form {
    display: grid;
    gap: 8px;
  }
  label {
    font-size: 14px;
  }
  .repo-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .repo-row :global(input) {
    flex: 1;
  }
  .limits {
    font-size: 12px;
    margin: 12px 0 0;
  }
  .candidate {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 0;
    border-top: 1px solid var(--border);
  }
  .candidate :global(button) {
    margin-top: 3px;
  }
  .candidate label {
    display: grid;
    gap: 4px;
    cursor: pointer;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .candidate label span {
    color: var(--muted);
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .empty {
    padding: 20px;
    border: 1px dashed var(--border);
    border-radius: 12px;
  }
  .installed-list {
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .installed-row {
    display: flex;
    gap: 12px;
    padding: 16px;
    align-items: flex-start;
  }
  .installed-row + .installed-row {
    border-top: 1px solid var(--border);
  }
  .installed-row > div {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .installed-row p {
    color: var(--muted);
    font-size: 13px;
    margin: 4px 0;
  }
  a {
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  a :global(svg) {
    display: inline;
    vertical-align: middle;
  }
  .catalog {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .catalog-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    min-width: 0;
  }
  .card-top {
    display: grid;
    gap: 4px;
  }
  strong {
    font-weight: 500;
  }
  .catalog-card p {
    flex: 1;
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }
  .catalog-card :global(button) {
    align-self: flex-start;
  }
  @media (max-width: 767px) {
    .catalog {
      grid-template-columns: 1fr;
    }
    .repo-row {
      flex-direction: column;
      align-items: stretch;
    }
    .import-panel,
    .preview {
      padding: 16px;
    }
  }
</style>

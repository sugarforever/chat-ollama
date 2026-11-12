<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    ArrowLeft,
    Plus,
    Upload,
    RefreshCw,
    Trash2,
    ChevronRight,
    CircleCheck,
    CircleAlert,
    LoaderCircle,
  } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  type Collection = {
    id: string;
    name: string;
    indexing?: boolean;
    needsReindex?: boolean;
  };
  type Document = { id: string; title: string; status: string; error?: string };
  let {
    collections,
    documents,
    oncreate,
    onupload,
    onmutate,
  }: {
    collections: Collection[];
    documents: Record<string, Document[]>;
    oncreate: (name: string) => Promise<boolean>;
    onupload: (id: string, event: Event) => void;
    onmutate: (url: string, body?: object, method?: string) => Promise<boolean>;
  } = $props();
  let name = $state("");
  let creating = $state(false);
  let submitting = $state(false);
  let remove = $state<{ title: string; url: string } | undefined>();
  let confirmOpen = $state(false);
  let deleting = $state(false);
  let deleteError = $state("");
  const collection = $derived(
    collections.find((c) => c.id === $page.url.searchParams.get("collection")),
  );
  async function create(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    try {
      if (await oncreate(name)) {
        name = "";
        creating = false;
      }
    } finally {
      submitting = false;
    }
  }
</script>

<section>
  {#if collection}
    <div class="knowledge-heading">
      <Button
        href="/settings/knowledge"
        variant="ghost"
        size="icon"
        aria-label="Back to collections"
        data-tip="Back to collections"><ArrowLeft /></Button
      >
      <h2>{collection.name}</h2>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete collection"
        data-tip="Delete collection"
        onclick={() => {
          remove = {
            title: collection.name,
            url: `/api/knowledge-bases/${collection.id}`,
          };
          deleteError = "";
          confirmOpen = true;
        }}><Trash2 /></Button
      >
    </div>
    <p class="document-status" role="status">
      {collection.indexing
        ? "Indexing…"
        : collection.needsReindex
          ? "Reindex required"
          : "Ready"}
    </p>
    {#if collection.needsReindex}<p class="notice" role="status">
        Embedding settings changed. Reindex this collection to use the new
        settings.
      </p>{/if}
    <div class="knowledge-toolbar">
      <label class="upload-button"
        ><Upload size={16} /><span>Upload documents</span><input
          type="file"
          aria-label="Upload document"
          accept=".pdf,.md,.markdown,.txt"
          onchange={(event) => onupload(collection.id, event)}
        /></label
      >
      <Button
        variant="outline"
        aria-label="Reindex collection"
        disabled={collection.indexing}
        onclick={() =>
          onmutate(`/api/knowledge-bases/${collection.id}/reindex`, {})}
        ><RefreshCw
          size={16}
          class={collection.indexing ? "animate-spin" : ""}
        />{collection.indexing ? "Indexing…" : "Reindex"}</Button
      >
    </div>
    <p class="muted">
      Text PDF, Markdown or plain text · up to 10 MiB · no OCR
    </p>
    <div class="knowledge-list">
      {#each documents[collection.id] ?? [] as document}<article
          class="document-row"
        >
          <div class="document-summary">
            <strong title={document.title}>{document.title}</strong><span
              class="document-status"
              class:failed={document.status === "failed"}
              >{#if document.status === "ready"}<CircleCheck size={15} />Ready ·
                published{:else if document.status === "failed"}<CircleAlert
                  size={15}
                />Failed{:else}<LoaderCircle
                  size={15}
                  class="animate-spin"
                />{document.status}{/if}</span
            >
            {#if document.error}<p
                class={document.status === "ready" ? "notice" : "error"}
              >
                {document.status === "ready"
                  ? "Rebuild warning. Published content remains available: "
                  : ""}{document.error}
              </p>{/if}
          </div>
          <div class="row">
            {#if document.status === "failed"}<Button
                variant="ghost"
                size="icon"
                aria-label="Retry document"
                data-tip="Retry document"
                onclick={() =>
                  onmutate(`/api/documents/${document.id}/retry`, {})}
                ><RefreshCw size={16} /></Button
              >{/if}<Button
              variant="ghost"
              size="icon"
              aria-label="Delete document"
              data-tip="Delete document"
              onclick={() => {
                remove = {
                  title: document.title,
                  url: `/api/documents/${document.id}`,
                };
                deleteError = "";
                confirmOpen = true;
              }}><Trash2 size={16} /></Button
            >
          </div>
        </article>{:else}<p class="empty-collection muted">
          Upload a document to get started.
        </p>{/each}
    </div>
  {:else}
    <div class="knowledge-heading">
      <h2>Knowledge</h2>
      <Button onclick={() => (creating = !creating)}
        ><Plus size={16} />New collection</Button
      >
    </div>
    {#if creating}<form class="new-collection" onsubmit={create}>
        <label
          >Collection name<Input
            bind:value={name}
            required
            maxlength={100}
            placeholder="e.g. Research notes"
          /></label
        >
        <div class="row">
          <Button type="submit" disabled={submitting}
            >{submitting ? "Creating…" : "Create collection"}</Button
          ><Button variant="ghost" onclick={() => (creating = false)}
            >Cancel</Button
          >
        </div>
      </form>{/if}
    <div class="knowledge-list">
      {#each collections as item}<a
          class="collection-row"
          href={`/settings/knowledge?collection=${encodeURIComponent(item.id)}`}
          ><span
            ><strong>{item.name}</strong><span class="muted"
              >{(documents[item.id] ?? []).length} documents</span
            ></span
          ><span class="document-status"
            >{#if item.indexing}<LoaderCircle
                size={15}
                class="animate-spin"
              />Indexing…{:else if item.needsReindex}<RefreshCw
                size={15}
              />Reindex required{:else}<CircleCheck size={15} />Ready{/if}</span
          ><ChevronRight size={15} /></a
        >{:else}<p class="empty-collection muted">
          Create a collection to add your documents.
        </p>{/each}
    </div>
  {/if}
</section>
<AlertDialog.Root bind:open={confirmOpen}
  ><AlertDialog.Content
    ><AlertDialog.Header
      ><AlertDialog.Title>Delete {remove?.title}?</AlertDialog.Title
      ><AlertDialog.Description
        >This removes the saved content. You can upload the original documents
        again.</AlertDialog.Description
      ></AlertDialog.Header
    ><AlertDialog.Footer
      ><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action
        disabled={deleting}
        onclick={async () => {
          if (!remove || deleting) return;
          deleting = true;
          deleteError = "";
          const target = remove;
          try {
            const removed = await onmutate(target.url, undefined, "DELETE");
            if (!removed) {
              deleteError = "Couldn’t delete. Try again.";
              return;
            }
            confirmOpen = false;
            if (target.url.startsWith("/api/knowledge-bases/"))
              await goto("/settings/knowledge");
          } finally {
            deleting = false;
          }
        }}>{deleting ? "Deleting…" : "Delete"}</AlertDialog.Action
      ></AlertDialog.Footer
    >
    {#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}
  </AlertDialog.Content></AlertDialog.Root
>

<style>
  .knowledge-heading {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
    overflow-wrap: anywhere;
  }
  .knowledge-list {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .collection-row,
  .document-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 16px;
    color: var(--text);
    text-decoration: none;
  }
  .collection-row:hover {
    background: var(--sidebar);
  }
  .collection-row + .collection-row,
  .document-row + .document-row {
    border-top: 1px solid var(--border);
  }
  .collection-row > span:first-child,
  .document-summary {
    display: grid;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  strong {
    font-size: 14px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .document-summary strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .document-status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .document-status.failed {
    color: var(--destructive);
  }
  .knowledge-toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .upload-button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--input);
    border-radius: 8px;
    cursor: pointer;
  }
  .upload-button:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .upload-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    cursor: pointer;
  }
  .new-collection {
    display: grid;
    gap: 12px;
    padding: 16px;
    margin-bottom: 20px;
    background: var(--sidebar);
    border-radius: 12px;
  }
  .empty-collection {
    margin: 0;
    padding: 24px;
  }
  .document-summary p {
    margin: 4px 0 0;
  }
  @media (max-width: 767px) {
    .collection-row,
    .document-row {
      padding: 12px;
      gap: 8px;
    }
    .collection-row .document-status {
      max-width: 110px;
    }
  }
</style>

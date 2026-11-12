<script lang="ts">
  import { Popover } from "bits-ui";
  import { Check, ChevronDown, LoaderCircle } from "@lucide/svelte";
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  import { buttonVariants } from "$lib/components/ui/button/button.svelte";
  import type { PublicProvider, ProviderSelection } from "$lib/contracts";

  let {
    providers,
    catalog,
    selection,
    onselect,
  }: {
    providers: PublicProvider[];
    catalog: { id: string; models: { id: string; name: string }[] }[];
    selection: ProviderSelection;
    onselect: (selection: ProviderSelection) => Promise<void>;
  } = $props();
  let open = $state(false);
  let pending = $state(false);
  let error = $state("");
  const selectedProvider = $derived(
    providers.find((p) => p.id === selection.providerId),
  );
  const groups = $derived.by(() => {
    return providers
      .map((provider) => {
        const known =
          provider.models ??
          catalog
            .find((p) => p.id === provider.service)
            ?.models.map((m) => m.id) ??
          [];
        const ids = [
          ...new Set(
            [
              ...(selection.providerId === provider.id
                ? [selection.modelId]
                : []),
              provider.modelId,
              ...known,
            ].filter(Boolean),
          ),
        ];
        const models = ids.map((id) => ({ id }));
        return { provider, models };
      })
      .filter((group) => group.models.length);
  });
  async function pick(providerId: string, modelId: string) {
    if (pending) return;
    if (providerId === selection.providerId && modelId === selection.modelId) {
      open = false;
      return;
    }
    pending = true;
    error = "";
    try {
      await onselect({ providerId, modelId });
      open = false;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      pending = false;
    }
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={(value) => {
    if (value) {
      error = "";
    }
  }}
>
  <Popover.Trigger
    data-slot="button"
    class={`${buttonVariants({ variant: "outline" })} model-chip`}
    aria-label="Change model"
    title={`${selectedProvider?.name ?? "Unavailable provider"} · ${selection.modelId}`}
  >
    <ProviderLogo
      service={selectedProvider?.service}
      name={selectedProvider?.name ?? ""}
      baseUrl={selectedProvider?.baseUrl ?? ""}
    />
    <span class="truncate">{selection.modelId}</span><ChevronDown size={14} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="model-popover"
      role="dialog"
      aria-label="Choose provider and model"
      sideOffset={8}
      align="end"
      collisionPadding={8}
    >
      <div class="model-options" aria-busy={pending}>
        {#each groups as { provider, models } (provider.id)}
          <div role="group" aria-label={provider.name}>
            <div class="model-group">
              <ProviderLogo
                service={provider.service}
                name={provider.name}
                baseUrl={provider.baseUrl}
              />
              <span class="truncate">{provider.name}</span>
            </div>
            {#each models as model (model.id)}
              <button
                data-slot="model-option"
                class="model-option"
                type="button"
                aria-label={model.id}
                title={model.id}
                aria-pressed={selection.providerId === provider.id &&
                  selection.modelId === model.id}
                disabled={pending}
                onclick={() => pick(provider.id, model.id)}
              >
                <span class="model-id truncate">{model.id}</span>
                {#if selection.providerId === provider.id && selection.modelId === model.id}<Check
                    size={16}
                    class="model-check"
                  />{/if}
              </button>
            {/each}
          </div>
        {:else}<p class="model-note">No models available.</p>{/each}
      </div>
      {#if pending}<p class="model-note" role="status">
          <LoaderCircle size={14} class="animate-spin" />Saving model…
        </p>{/if}
      {#if error}<p class="model-note model-error" role="alert">{error}</p>{/if}
      <p class="model-note">For your next message.</p>
      <div class="model-footer">
        <a href="/settings/providers">Manage providers</a>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.model-popover) {
    z-index: 40;
    width: min(280px, calc(100vw - 16px));
    max-height: min(360px, var(--bits-popover-content-available-height));
    display: flex;
    flex-direction: column;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--canvas);
    box-shadow: 0 8px 32px rgb(20 20 18 / 0.12);
    overflow: auto;
  }
  .model-options {
    min-height: 0;
    overflow-y: auto;
    flex-shrink: 1;
  }
  .model-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 6px 3px;
    color: var(--muted);
    font-size: 11px;
  }
  .model-group :global(img),
  .model-group :global(svg) {
    width: 14px;
    height: 14px;
  }
  .model-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 30px;
    padding: 4px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    font-size: 12px;
    cursor: pointer;
  }
  .model-option:hover,
  .model-option:focus-visible {
    background: var(--sidebar);
  }
  .model-id {
    font-family: var(--font-mono);
  }
  .model-option :global(.model-check) {
    margin-left: auto;
    color: var(--accent);
    flex-shrink: 0;
  }
  .model-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 6px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    flex-shrink: 0;
  }
  .model-error {
    color: var(--destructive);
  }
  .model-footer {
    border-top: 1px solid var(--border);
    margin: 4px -4px -4px;
    padding: 4px;
    flex-shrink: 0;
  }
  .model-footer a {
    display: block;
    padding: 6px;
    border-radius: 6px;
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
  }
  .model-footer a:hover {
    background: var(--sidebar);
  }
  @media (max-width: 767px) {
    .model-option {
      min-height: 44px;
    }
  }
</style>

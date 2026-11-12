<script lang="ts">
  import ProviderLogo from "$lib/ProviderLogo.svelte";
  let {
    providers,
    value = $bindable(""),
  }: {
    providers: {
      id: string;
      name: string;
      service?: string;
      baseUrl: string;
      modelId: string;
    }[];
    value: string;
  } = $props();
</script>

<fieldset class="provider-defaults" aria-label="Default chat provider">
  <legend>Provider for new conversations</legend>
  <p class="muted">
    Existing conversations keep their current provider and model.
  </p>
  <div class="defaults-list">
    {#each providers as provider}<label class="default-provider"
        ><input
          type="radio"
          name="default-provider"
          bind:group={value}
          value={provider.id}
          aria-label={provider.name}
        /><ProviderLogo
          service={provider.service}
          name={provider.name}
          baseUrl={provider.baseUrl}
        /><span
          ><strong>{provider.name}</strong><span class="muted model-id"
            >{provider.modelId}</span
          ></span
        ></label
      >{/each}
  </div>
</fieldset>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  legend {
    font-weight: 500;
    padding: 0;
  }
  p {
    margin: 4px 0 16px;
  }
  .defaults-list {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    cursor: pointer;
  }
  label:hover {
    background: var(--sidebar);
  }
  label + label {
    border-top: 1px solid var(--border);
  }
  input {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: var(--primary);
  }
  label > span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  strong {
    font-size: 14px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .model-id {
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
</style>

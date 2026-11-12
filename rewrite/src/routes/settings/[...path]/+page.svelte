<script lang="ts">
  import SettingsPage from "$lib/SettingsPage.svelte";
  export let data: import("./$types").PageData;
  let settingsPage: any;
  export const snapshot = {
    capture: () => settingsPage?.capture(),
    restore: (value: any) => settingsPage?.restore(value),
  };
</script>

{#key data.routeKey}<SettingsPage
    bind:this={settingsPage}
    tab={data.tab}
    editorId={data.editorId}
    newService={data.newService}
    newAuth={data.newAuth}
    draftId={data.draftId}
    catalogOpen={data.catalogOpen}
    saved={data.saved}
  />{/key}

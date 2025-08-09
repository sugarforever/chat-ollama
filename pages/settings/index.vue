<script setup lang="ts">
const config = useRuntimeConfig()
const isMcpEnabled = computed(() => config.mcpEnabled)
</script>

<template>
  <div class="max-w-6xl mx-auto p-4">
    <div class="mb-4">
      <SettingsServers />
    </div>
    <div v-if="isMcpEnabled" class="mb-4">
      <SettingsMcpServers />
    </div>
    <div class="mb-4">
      <SettingsChatSettings />
    </div>
    <div class="mb-4">
      <SettingsRealtimeChat />
    </div>
    <div class="mb-4">
      <SettingsLanguageSelectMenu />
    </div>
  </div>
</template>

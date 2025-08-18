<script setup lang="ts">
const { features, pending } = useFeatures()
const isMcpEnabled = computed(() => features.value.mcpEnabled)
</script>

<template>
  <div class="max-w-6xl mx-auto p-4">
    <div v-if="pending" class="text-center py-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
      <p class="mt-2 text-sm text-gray-500">Loading settings...</p>
    </div>

    <template v-else>
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
    </template>
  </div>
</template>

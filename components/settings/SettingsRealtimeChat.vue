<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
const { t } = useI18n()

const { features } = useFeatures()
const isRealtimeChatFeatureEnabled = computed(() => features.value.realtimeChatEnabled)

// Use composable for persistent storage
const realtimeChatEnabled = useStorage('realtimeChatEnabled', false)
</script>

<template>
  <ClientOnly>
    <SettingsCard v-if="isRealtimeChatFeatureEnabled" :title="t('settings.realtimeChat')">
      <UFormGroup :label="t('settings.realtimeChatEnabled')">
        <UToggle v-model="realtimeChatEnabled" />
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

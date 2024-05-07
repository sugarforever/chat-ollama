<script lang="ts" setup>
const { t } = useI18n()

const model = computed({
  get() {
    const val = chatDefaultSettings.value.model
    return typeof val === 'string'
      ? [val, ''] as [string, string]
      : val
  },
  set(val) {
    chatDefaultSettings.value.model = val
  }
})
</script>

<template>
  <ClientOnly>
    <SettingsCard :title="t('settings.chatSettings')">
      <UFormGroup :label="t('settings.defaultModel')" class="mb-4">
        <ModelsSelectMenu v-model="model" size="lg"></ModelsSelectMenu>
      </UFormGroup>
      <UFormGroup :label="t('chat.attachedMessagesCount')">
        <div class="flex items-center">
          <span class="mr-2 w-6 text-primary-500">{{ chatDefaultSettings.attachedMessagesCount }}</span>
          <URange v-model="chatDefaultSettings.attachedMessagesCount" :min="0" :max="$config.public.chatMaxAttachedMessages" size="md" />
        </div>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

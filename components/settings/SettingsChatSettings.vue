<script lang="ts" setup>

const { t } = useI18n()
const features = useFeatures()
const isMcpEnabled = computed(() => features.mcpEnabled)

</script>

<template>
  <ClientOnly>
    <SettingsCard :title="t('settings.chatSettings')">
      <div class="space-y-6">
        <!-- Default Model Section -->
        <UFormGroup :label="t('settings.defaultModel')">
          <div class="max-w-md">
            <ModelSelectorDropdown v-model="chatDefaultSettings.models" size="lg"></ModelSelectorDropdown>
          </div>
        </UFormGroup>

        <!-- Attached Messages Count Section -->
        <UFormGroup :label="t('chat.attachedMessagesCount')">
          <div class="flex items-center max-w-sm">
            <span class="mr-3 w-8 text-center text-primary-500 font-medium">{{ chatDefaultSettings.attachedMessagesCount }}</span>
            <URange 
              v-model="chatDefaultSettings.attachedMessagesCount" 
              :min="0" 
              :max="$config.public.chatMaxAttachedMessages" 
              size="md" 
              class="flex-1" />
          </div>
        </UFormGroup>

        <!-- Tool Usage Toggle Section -->
        <UFormGroup v-if="isMcpEnabled" :label="t('settings.enableToolUsage')" :help="t('settings.enableToolUsageHelp')">
          <UToggle 
            v-model="chatDefaultSettings.enableToolUsage" 
            size="md" 
          />
        </UFormGroup>
      </div>
    </SettingsCard>
  </ClientOnly>
</template>

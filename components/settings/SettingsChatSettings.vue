<script lang="ts" setup>

</script>

<template>
  <ClientOnly>
    <SettingsCard title="Chat Settings">
      <UFormGroup label="Default Model" class="mb-4">
        <ModelsSelectMenu v-model="chatDefaultSettings.model" size="lg"></ModelsSelectMenu>
      </UFormGroup>
      <UFormGroup label="Attached Message Count">
        <div class="flex items-center">
          <span class="mr-2 w-6 text-primary-500">{{ chatDefaultSettings.attachedMessagesCount }}</span>
          <URange v-model="chatDefaultSettings.attachedMessagesCount" :min="0" :max="50" size="md" />
        </div>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

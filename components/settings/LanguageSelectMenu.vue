<script setup lang="ts">
import { languageSelected } from '@/utils/settings'
import { useI18n } from 'vue-i18n'
const { locale, availableLocales, setLocale, t } = useI18n()

const selectLanguage = computed({
  get() {
    return returnData();
  },
  set(val) {
    setLocale(val.value)
    languageSelected.value = val.value
  }
})
function returnData() {
  return locale.value
}
</script>

<template>
  <ClientOnly>
    <SettingsCard :title="t('Language')">
      <UFormGroup :label="t('UI Language')" class="mb-4">
        <USelectMenu :options="availableLocales" v-model="selectLanguage">
          <template #option="{ option }">
            <span class="text-muted">[</span>
            <span>{{ option }}</span>
            <span class="text-muted">]</span>
          </template>
        </USelectMenu>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { locale, setLocale, t } = useI18n()
import { LanguageList,  findLanguageItemByLanguageName } from '@/config/i18n'

const selectLanguage = computed({
  get() {
    return returnData();
  },
  set(val) {
    setLocale(val.code)
  }
})
function returnData() {
  return findLanguageItemByLanguageName(locale.value)
}
</script>

<template>
  <ClientOnly>
    <SettingsCard :title="t('Language')">
      <UFormGroup :label="t('UI Language')" class="mb-4">
        <USelectMenu :options="LanguageList" v-model="selectLanguage">
          <template #label>
            <span class="text-muted">[</span>
            <span>{{ selectLanguage.name }}</span>
            <span class="text-muted">]</span>
          </template>
          <template #option="{ option }">
            <span>{{ option.code }}</span>
            <span class="text-muted">[</span>
            <span>{{ option.name }}</span>
            <span class="text-muted">]</span>
          </template>
        </USelectMenu>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

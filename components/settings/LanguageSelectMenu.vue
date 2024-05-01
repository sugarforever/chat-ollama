<script setup lang="ts">
// import { languageSelected } from '@/utils/settings'
import { useI18n } from 'vue-i18n'
const { locale, setLocale, t, availableLocales } = useI18n()

console.log("availableLocales>>", availableLocales)

import { LanguageList,  findLanguageItemByLanguageName } from '@/config/i18n'

const selectLanguage = computed({
  get() {
    return returnData();
  },
  set(val) {
    setLocale(val.code)
    // languageSelected.value = val.code
  }
})
function returnData() {
  // return locale.value
  console.log("availableLocales", availableLocales)
  console.log("now Language", locale, findLanguageItemByLanguageName(locale.value))
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
            <span>{{ selectLanguage.code }}</span>
            <span class="text-muted">]</span>
          </template>
          <template #option="{ option }">
            <span>{{ option.file }}</span>
            <span class="text-muted">[</span>
            <span>{{ option.code }}</span>
            <span class="text-muted">]</span>
          </template>
        </USelectMenu>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

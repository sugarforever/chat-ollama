<script setup lang="ts">
import { LanguageList, findLanguageItemByLanguageName } from '@/config/i18n'

const { locale, setLocale, t } = useI18n()

const selectLanguage = computed({
  get() {
    return returnData()
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
    <SettingsCard title="">
      <UFormGroup :label="t('settings.language')" class="mb-4">
        <USelectMenu :options="LanguageList" v-model="selectLanguage">
          <template #label>
            <span>{{ selectLanguage.name }}</span>
          </template>
          <template #option="{ option }">
            <span>{{ option.name }}</span>
          </template>
        </USelectMenu>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

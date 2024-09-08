<script setup lang="ts">
import { LanguageList, findLanguageItemByLanguageName } from '@/config/i18n'

const { locale, setLocale, t } = useI18n()
const links = useMenus()
const defaultPage = useCookie('default-page', { path: '/', expires: new Date('2030-03-03'), default: () => DEFAULT_PAGE_LINK })

const selectLanguage = computed({
  get() {
    return returnData()
  },
  set(val) {
    setLocale(val.code)
  }
})

const defaultPageName = computed(() => {
  return links.value.find(el => el.to === defaultPage.value)?.label || ''
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
      <UFormGroup :label="t('settings.defaultPage')">
        <USelectMenu :options="links" valueAttribute="to" v-model="defaultPage">
          <template #label>
            <span>{{ defaultPageName }}</span>
          </template>
        </USelectMenu>
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>

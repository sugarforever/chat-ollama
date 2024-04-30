import { languageSelected } from '@/utils/settings'

import en from '@/locales/en-US.json'
import zhCN from '@/locales/zh-CN.json'

export default defineI18nConfig(() => ({
  legacy: false,
  locale: languageSelected.value,
  fallbackLocale: 'English',
  messages: {
    "简体中文": zhCN,
    "English": en
  },
}))

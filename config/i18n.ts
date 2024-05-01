// import { languageSelected } from '@/utils/settings'

// import en from '@/locales/en-US.json'
// import zhCN from '@/locales/zh-CN.json'

interface LanguageItem {
  code: string,
  file: string,
}
export const LanguageList: LanguageItem[] = [
  {code: "English",file:"en-US.json"},
  {code: "简体中文",file:"zh-CN.json"},
]

// const i18nConfig = defineI18nConfig(() => ({
//   legacy: false,
//   // locale: languageSelected.value,
//   fallbackLocale: 'English',
//   messages: {
//     // "简体中文": zhCN,
//     // "English": en
//   },
// }))
// export default i18nConfig

export function findLanguageItemByLanguageName(Name:string):LanguageItem {
  for (const languageItem of LanguageList) {
    if (languageItem.code == Name)return languageItem
  }
  return {code: Name , file: "no find language File"}
}

interface LanguageItem {
  // Used for saving, it should be able to automatically match the browser's default language in the future
  code: string,
  // Used to locate files
  file: string,
  // Display in language switching UI
  name: string,
}
export const LanguageList: LanguageItem[] = [
  { code: "en-US", file: "en-US.json", name: "English" },
  { code: "zh-CN", file: "zh-CN.json", name: "简体中文" },
]
export function findLanguageItemByLanguageName(Code: string): LanguageItem {
  for (const languageItem of LanguageList) {
    if (languageItem.code == Code) return languageItem
  }
  return { code: Code, file: "Language file not found", name: `This language '${Code}' is not supported` }
}

export function noop() {
  // do nothing
}

export function urlGlob2Regexp(pattern: string) {
  const s = pattern.replace(/([.?+^$[\]\\(){}|\/-])/g, "\\$1").replace(/(?<!\\)\*/, '.*')
  return new RegExp(s)
}

export function tryParseJson(json: string, defaultValue: any = null) {
  try {
    return JSON.parse(json)
  } catch (e) {
    console.error(e)
    return defaultValue
  }
}

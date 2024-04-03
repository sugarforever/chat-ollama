export function omit<O extends Record<string, any>, K extends keyof O>(obj: O, keys: K[]) {
  return (Object.keys(obj) as K[]).reduce((acc, key) => {
    if (!keys.includes(key))
      Object.assign(acc, { [key]: obj[key] })
    return acc
  }, {} as Omit<O, typeof keys[number]>)
}

export function pick<O extends Record<string, any>, K extends keyof O>(obj: O, keys: K[]) {
  return keys.reduce((acc, key) => {
    acc[key] = obj[key]
    return acc
  }, {} as Pick<O, typeof keys[number]>)
}

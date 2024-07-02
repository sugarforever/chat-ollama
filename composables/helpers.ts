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

export function deepClone<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj // primitive value or null
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T
  }

  const clone: { [key: string]: any } = {}

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key])
    }
  }

  return clone as T
}

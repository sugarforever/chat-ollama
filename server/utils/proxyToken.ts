import { createHash } from 'node:crypto'

const radomKey = Math.random().toString(36).slice(-4) + Date.now().toString(36).slice(-4)

export function proxyTokenGenerate() {
  const key = Date.now().toString()
  const token = `${key}-${createHash('sha256').update(key + radomKey).digest('base64')}`
  return encodeURIComponent(token)
}

export function proxyTokenValidate(token: string) {
  if (!token) return false

  const [key, hash] = decodeURIComponent(token).split('-')

  if (!key || !hash) return false

  const expectedHash = createHash('sha256').update(key + radomKey).digest('base64')
  return expectedHash === hash
}

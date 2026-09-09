import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import jwt from 'jsonwebtoken'

import { getJwtSecret, signAuthToken, verifyAuthToken } from '../../../server/utils/jwt'

test('rejects a missing JWT secret', () => {
  assert.throws(
    () => getJwtSecret({}),
    /SECRET must be set/
  )
})

test('rejects public placeholder JWT secrets', () => {
  for (const secret of ['changeit', 'changeme']) {
    assert.throws(
      () => getJwtSecret({ SECRET: secret }),
      /deployment-specific/
    )
  }
})

test('rejects JWT secrets shorter than 32 characters', () => {
  assert.throws(
    () => getJwtSecret({ SECRET: 'short-deployment-secret' }),
    /at least 32 characters/
  )
})

test('returns a deployment-specific JWT secret', () => {
  const secret = 'a-deployment-specific-secret-with-32-chars'

  assert.equal(getJwtSecret({ SECRET: secret }), secret)
})

test('accepts secrets containing exactly 32 characters', () => {
  const secret = '12345678901234567890123456789012'

  assert.equal(getJwtSecret({ SECRET: secret }), secret)
})

test('signs and verifies authentication tokens using HS256', () => {
  const secret = 'a-deployment-specific-secret-with-32-chars'
  const token = signAuthToken({ id: 1, role: 'user' }, '1h', { SECRET: secret })

  assert.equal(jwt.decode(token, { complete: true })?.header.alg, 'HS256')
  assert.deepEqual(
    verifyAuthToken<{ id: number, role: string }>(token, { SECRET: secret }).role,
    'user'
  )
})

test('rejects authentication tokens signed with another algorithm', () => {
  const secret = 'a-deployment-specific-secret-with-32-chars'
  const token = jwt.sign({ id: 1, role: 'admin' }, secret, { algorithm: 'HS384' })

  assert.throws(
    () => verifyAuthToken(token, { SECRET: secret }),
    /invalid algorithm/
  )
})

test('startup plugin rejects an unsafe secret', () => {
  const script = `
    globalThis.defineNitroPlugin = callback => callback
    import('./server/plugins/validate-auth-config.ts').then(({ default: plugin }) => plugin())
  `
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SECRET: 'changeit' }
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /deployment-specific/)
})

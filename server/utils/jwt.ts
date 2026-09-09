import jwt, { type SignOptions } from 'jsonwebtoken'

const PUBLIC_PLACEHOLDER_SECRETS = new Set(['changeit', 'changeme'])
const MINIMUM_SECRET_LENGTH = 32

export function getJwtSecret(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  const secret = environment.SECRET?.trim()

  if (!secret) {
    throw new Error('SECRET must be set to a deployment-specific random value')
  }

  if (PUBLIC_PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    throw new Error('SECRET must be a deployment-specific random value, not a public placeholder')
  }

  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(`SECRET must be at least ${MINIMUM_SECRET_LENGTH} characters`)
  }

  return secret
}

export function signAuthToken(
  payload: object,
  expiresIn: SignOptions['expiresIn'],
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  return jwt.sign(payload, getJwtSecret(environment), {
    algorithm: 'HS256',
    expiresIn
  })
}

export function verifyAuthToken<T>(
  token: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
): T {
  return jwt.verify(token, getJwtSecret(environment), {
    algorithms: ['HS256']
  }) as T
}

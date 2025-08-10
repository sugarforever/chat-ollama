import { createError, eventHandler, getRequestHeader, H3Event } from 'h3'
import jwt from 'jsonwebtoken'
import { SECRET } from './login.post'

const TOKEN_TYPE = 'Bearer'

const extractToken = (authHeaderValue: string) => {
  const [, token] = authHeaderValue.split(`${TOKEN_TYPE} `)
  return token
}

const ensureAuth = (event: H3Event) => {
  const authHeaderValue = getRequestHeader(event, 'authorization')
  const cookieToken = getCookie(event, 'auth-token')

  // Try Authorization header first
  if (authHeaderValue != null) {
    const extractedToken = extractToken(authHeaderValue)
    try {
      return jwt.verify(extractedToken, SECRET)
    } catch (error) {
      console.log('Invalid token from Authorization header.')
    }
  }

  // Fall back to cookie token
  if (cookieToken) {
    try {
      return jwt.verify(cookieToken, SECRET)
    } catch (error) {
      console.log('Invalid token from cookie.')
    }
  }

  return null
}

export default eventHandler((event) => {
  const user = ensureAuth(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  // Return user data in the format expected by @sidebase/nuxt-auth
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  }
})

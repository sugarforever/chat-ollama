import { getRequestHeader, H3Event } from 'h3'
import jwt from 'jsonwebtoken'
import { SECRET } from '../api/auth/login.post'

const TOKEN_TYPE = 'Bearer'

const extractToken = (authHeaderValue: string) => {
  const [, token] = authHeaderValue.split(`${TOKEN_TYPE} `)
  return token
}

const parseAuthUser = (event: H3Event) => {
  const authHeaderValue = getRequestHeader(event, 'Authorization')

  if (authHeaderValue != null) {
    const extractedToken = extractToken(authHeaderValue)
    try {
      return jwt.verify(extractedToken, SECRET)
    } catch (error) {
      console.log('Invalid token from Authorization header.')
      return null
    }
  } else {
    return null
  }
}

export default defineEventHandler((event) => {
  const uri = new URL(event.path, 'http://localhost')
  const user = parseAuthUser(event)
  event.context.user = user

  const pathname = uri.pathname.replace(/\/+$/, '')
  if (pathname.startsWith('/api') && pathname !== '/api/auth/user') {
    console.log(`URL: ${pathname} User: ${JSON.stringify(user)}`)
  }
})

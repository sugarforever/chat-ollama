import { getRequestHeader, H3Event } from 'h3'
import jwt from 'jsonwebtoken'
import { SECRET } from '../api/auth/login.post'

const TOKEN_TYPE = 'Bearer'

const extractToken = (authHeaderValue: string) => {
  const [, token] = authHeaderValue.split(`${TOKEN_TYPE} `)
  return token
}

const verifyToken = (event: H3Event) => {
  const authHeaderValue = getRequestHeader(event, 'Authorization')

  if (authHeaderValue != null) {
    const extractedToken = extractToken(authHeaderValue)
    try {
      return jwt.verify(extractedToken, SECRET)
    } catch (error) {
      console.error('Failed to verify extracted token:', error)
      return null
    }
  } else {
    return null
  }
}

export default defineEventHandler((event) => {
  const { _path } = event
  const user = verifyToken(event)
  event.context.user = user

  if (_path?.startsWith('/api') && _path !== '/api/auth/user') {
    console.log(`URL: ${_path} User: ${JSON.stringify(user)}`)
  }
})

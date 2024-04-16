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
  if (typeof authHeaderValue === 'undefined') {
    throw createError({ statusCode: 403, statusMessage: 'Need to pass valid Bearer-authorization header to access this endpoint' })
  }

  const extractedToken = extractToken(authHeaderValue)
  try {
    return jwt.verify(extractedToken, SECRET)
  } catch (error) {
    console.error('Login failed with error:', error)
    // throw createError({ statusCode: 403, statusMessage: 'You must be logged in to use this endpoint' })
    return null
  }
}

export default eventHandler((event) => {
  const user = ensureAuth(event)
  return user
})

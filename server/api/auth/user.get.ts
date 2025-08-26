import { createError, eventHandler, getRequestHeader, H3Event } from 'h3'
import { requireAuth } from '../../utils/auth'

export default eventHandler((event) => {
  const user = requireAuth(event)

  // Return user data in the format expected by @sidebase/nuxt-auth
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  }
})

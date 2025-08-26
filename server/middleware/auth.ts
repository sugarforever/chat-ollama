import { H3Event } from 'h3'
import { parseAuthUser } from '../utils/auth'

export default defineEventHandler((event) => {
  const uri = new URL(event.path, 'http://localhost')
  const user = parseAuthUser(event)
  event.context.user = user

  const pathname = uri.pathname.replace(/\/+$/, '')
  if (pathname.startsWith('/api') && pathname !== '/api/auth/user') {
    console.log(`URL: ${pathname} User: ${JSON.stringify(user)}`)
  }
})

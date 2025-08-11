import { eventHandler, deleteCookie } from 'h3'

export default eventHandler((event) => {
  // Clear the auth-token cookie
  deleteCookie(event, 'auth-token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  })

  return { status: 'OK', message: 'Successfully logged out' }
})

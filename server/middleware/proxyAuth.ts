import { proxyTokenValidate } from '~/server/utils/proxyToken'

export default defineEventHandler(event => {
  const uri = new URL(event.path, 'http://localhost')

  if (/^\/api\/proxy\/?$/.test(uri.pathname)) {
    const query = getQuery<{ token: string }>(event)
    console.log('=>', query.token)
    if (!proxyTokenValidate(query.token)) {
      setResponseStatus(event, 400)
      return 'Invalid proxy token'
    }
  }
})

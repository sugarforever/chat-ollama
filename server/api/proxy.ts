import http from 'node:http'
import https from 'node:https'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { type H3Event } from 'h3'
import { omit } from '~/composables/helpers'

type Protocol = 'http:' | 'https:'

const proxyCacheMap = new Map<string, InstanceType<typeof HttpProxyAgent> | InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent>>()

function createProxyAgent(proxyUrl: string, protocol: Protocol) {
  if (proxyCacheMap.has(proxyUrl))
    return proxyCacheMap.get(proxyUrl)

  proxyCacheMap.clear()

  const p = proxyUrl.startsWith('http:')
    ? protocol === 'https:' ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl)
    : new SocksProxyAgent(proxyUrl)

  proxyCacheMap.set(proxyUrl, p)

  return p
}

async function proxyFetch(event: H3Event, apiEndpoint: string, proxyUrl: string) {
  return new Promise((resolve, reject) => {
    const uri = new URL(apiEndpoint)
    const request = (uri.protocol === 'https:' ? https : http).request(apiEndpoint, {
      headers: omit(event.node.req.headers, ['host', 'origin', 'referer', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port', 'x-forwarded-proto']),
      method: event.node.req.method,
      agent: createProxyAgent(proxyUrl, uri.protocol as Protocol)
    }, response => {
      Object.entries(response.headers).forEach(([key, value]) => setResponseHeader(event, key, value!))
      if (response.statusCode) setResponseStatus(event, response.statusCode)
      response.pipe(event.node.res)
      resolve(undefined)
    }).on('error', e => reject(e))

    event.node.req.pipe(request)
  })
}

export default defineEventHandler(async (event) => {
  const url = event.node.req.url
  const config = useRuntimeConfig()

  if (!config.public.modelProxyEnabled) {
    setResponseStatus(event, 404)
    return 'Proxy is disabled'
  }

  if (!url) {
    setResponseStatus(event, 400)
    return 'Invalid URL'
  }

  const { endpoint } = getQuery(event) as { endpoint: string }
  const proxyUrl = config.modelProxyUrl

  if (endpoint && proxyUrl) {
    try {
      await proxyFetch(event, endpoint, proxyUrl)
    } catch (e: any) {
      console.error(e.message)
      setResponseStatus(event, 400)
      return e.message ?? 'Proxy error'
    }
  } else {
    setResponseStatus(event, 400)
    return 'Invalid request'
  }
})

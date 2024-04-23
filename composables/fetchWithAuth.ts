import type { NitroFetchRequest, NitroFetchOptions } from 'nitropack'
import type { FetchOptions } from 'ofetch'

export const fetchWithAuth = (request, opts?) => {
  const { token } = useAuth()
  return fetch(request, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: token.value,
    }
  })
}

export const $fetchWithAuth = (request, opts?) => {
  const { token } = useAuth()
  return $fetch(request, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: token.value,
    }
  })
}

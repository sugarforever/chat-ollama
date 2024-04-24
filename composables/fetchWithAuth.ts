import type { NitroFetchRequest, NitroFetchOptions } from 'nitropack'

export const fetchWithAuth: typeof fetch = (request, opts?) => {
  const { token } = useAuth()
  return fetch(request, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: token.value!,
    }
  })
}

export function $fetchWithAuth<T = unknown, R extends NitroFetchRequest = NitroFetchRequest, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>(request: R, opts?: O) {
  const { token } = useAuth()
  return $fetch<T, R>(request, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: token.value!,
    }
  })
}

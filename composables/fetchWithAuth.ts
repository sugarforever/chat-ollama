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

function _fetchWithAuth(request: any, opts?: any) {
  const { token } = useAuth()
  return $fetch(request, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: token.value!,
    }
  })
}

_fetchWithAuth.raw = $fetch.raw
_fetchWithAuth.create = $fetch.create

export const $fetchWithAuth = _fetchWithAuth as typeof $fetch

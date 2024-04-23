const { token } = useAuth()

export const authHeaders = computed(() => {
  return {
    'Authorization': token.value
  }
})

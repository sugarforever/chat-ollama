/**
 * Server-side utility to check if realtime chat feature is enabled
 */
export function isRealtimeChatEnabled(): boolean {
  const config = useRuntimeConfig()
  return config.realtimeChatEnabled
}

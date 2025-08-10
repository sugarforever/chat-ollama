/**
 * Server-side utility to check if models management feature is enabled
 */
export function isModelsManagementEnabled(): boolean {
    const config = useRuntimeConfig()
    return config.modelsManagementEnabled
}

/**
 * Server-side utility to check if instructions feature is enabled
 */
export function isInstructionsEnabled(): boolean {
    const config = useRuntimeConfig()
    return config.instructionsEnabled
}

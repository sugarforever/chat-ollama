import { getOllama } from '@/server/utils/ollama'

export default defineEventHandler(async (event) => {
    // Check if models management feature is enabled
    if (!isModelsManagementEnabled()) {
        setResponseStatus(event, 403, 'Models management feature is disabled')
        return { error: 'Models management feature is disabled' }
    }

    const { model } = await readBody(event)

    const ollama = await getOllama(event, true)
    if (!ollama) return

    const response = await ollama.delete({ model })
    return response
})

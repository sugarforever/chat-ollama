import ollama from 'ollama'

export default defineEventHandler(async (event) => {
    const response = await ollama.list();
    return response.models
})

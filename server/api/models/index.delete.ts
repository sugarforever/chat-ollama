import { Ollama } from 'ollama'

export default defineEventHandler(async (event) => {
    const headers = getRequestHeaders(event);
    const { model } = await readBody(event);
    const host = headers['x_ollama_host'] || 'http://localhost:11434';

    console.log('Ollama host: ', host);
    const ollama = new Ollama({ host });
    const response = await ollama.delete({ model });
    console.log('Ollama model delete response: ', response);
    return response
})

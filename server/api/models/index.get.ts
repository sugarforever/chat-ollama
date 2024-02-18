import { Ollama } from 'ollama'

export default defineEventHandler(async (event) => {
    const headers = getRequestHeaders(event);
    const host = headers['x_ollama_host'] || 'http://localhost:11434';
    console.log('Ollama host: ', host);
    const ollama = new Ollama({ host });
    const response = await ollama.list();
    console.log('Ollama model list response: ', response);
    return response
})

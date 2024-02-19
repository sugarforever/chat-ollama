import { Ollama } from 'ollama'

export default defineEventHandler(async (event) => {
    const headers = getRequestHeaders(event);
    const { model } = await readBody(event);
    const host = headers['x_ollama_host'] || 'http://localhost:11434';
    const username = headers['x_ollama_username'];
    const password = headers['x_ollama_password'];

    const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const authorization = btoa(`${username}:${password}`);
        console.log(`Authorization: ${authorization}`);
        headers.set('Authorization', `Basic ${authorization}`);
        return fetch(input, { ...init, headers });
    }

    console.log('Ollama host: ', host);
    const ollama = new Ollama({ host, fetch: fetchWithAuth });
    const response = await ollama.delete({ model });
    console.log('Ollama model delete response: ', response);
    return response
})

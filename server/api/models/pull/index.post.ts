import { Ollama } from 'ollama';
import { Readable } from 'stream';

export default defineEventHandler(async (event) => {
    const headers = getRequestHeaders(event);
    const { model, stream } = await readBody(event);
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
    const response = await ollama.pull({ model, stream });

    setResponseHeader(event, 'Content-Type', 'text/event-stream');
    setResponseHeader(event, 'Cache-Control', 'no-cache');
    setResponseHeader(event, 'Connection', 'keep-alive');

    const readableStream = Readable.from((async function* () {
        for await (const chunk of response) {
            console.log('Ollama model pull response chunk: ', chunk);
            yield `${JSON.stringify(chunk)}\n\n`;
        }
    })());
    return sendStream(event, readableStream);
})

import { Ollama } from 'ollama';
import { Readable } from 'stream';
import { setEventStreamResponse, FetchWithAuth } from '@/server/utils';

export default defineEventHandler(async (event) => {
    const { host, username, password } = event.context.ollama;
    const { model, stream } = await readBody(event);

    setEventStreamResponse(event);

    const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });
    const response = await ollama.pull({ model, stream });

    const readableStream = Readable.from((async function* () {
        for await (const chunk of response) {
            yield `${JSON.stringify(chunk)}\n\n`;
        }
    })());
    return sendStream(event, readableStream);
})

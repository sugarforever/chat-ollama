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
        try {
            for await (const chunk of response) {
                yield `${JSON.stringify(chunk)}\n\n`;
            }
        } catch (error) {
            const error_response = JSON.stringify({ "error": error.message })
            yield `${error_response}\n\n`;// You can choose to yield an empty string or any other value to indicate the error
        }
    })());
    return sendStream(event, readableStream);
})

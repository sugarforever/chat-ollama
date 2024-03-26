import { Readable } from 'stream';
import { setEventStreamResponse } from '@/server/utils';
import { getOllama } from '@/server/utils/ollama'

export default defineEventHandler(async (event) => {
  const { model, stream } = await readBody(event);

  setEventStreamResponse(event);

  const ollama = await getOllama(event, true)
  if (!ollama) return

  const response = await ollama.pull({ model, stream });

  const readableStream = Readable.from((async function* () {
    try {
      for await (const chunk of response) {
        yield `${JSON.stringify(chunk)}\n\n`;
      }
    } catch (error: any) {
      const error_response = JSON.stringify({ "error": error.message })
      yield `${error_response}\n\n`;// You can choose to yield an empty string or any other value to indicate the error
    }
  })());
  return sendStream(event, readableStream);
})

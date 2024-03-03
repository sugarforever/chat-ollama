import { Ollama } from 'ollama'
import { FetchWithAuth } from '@/server/utils';

export default defineEventHandler(async (event) => {
  const { host, username, password } = event.context.ollama;
  const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });
  const response = await ollama.list();
  return response
})

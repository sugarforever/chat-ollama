import { getOllama } from '@/server/utils/ollama'

export default defineEventHandler(async (event) => {
  const { model } = await readBody(event);

  const ollama = await getOllama(event, true)
  if (!ollama) return

  const response = await ollama.delete({ model });
  return response
})

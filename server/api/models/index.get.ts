import { Ollama } from 'ollama'
import { FetchWithAuth } from '@/server/utils';
import { OPENAI_MODELS } from '@/server/utils/models';

export default defineEventHandler(async (event) => {
  const { host, username, password } = event.context.ollama;
  const { x_openai_api_key: openai_api_key, x_anthropic_api_key } = event.context.keys;
  console.log("openai_api_key: ", openai_api_key);
  const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });
  const response = await ollama.list();

  if (openai_api_key) {
    OPENAI_MODELS.forEach((model) => {
      response.models.push({
        name: model,
        model: model,
        details: {
          family: 'OpenAI'
        }
      });
    });

  }

  console.log(response);

  return response
})

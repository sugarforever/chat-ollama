import ollama from 'ollama';

export default defineEventHandler(async (event) => {
  const { model, content } = await readBody(event);
  console.log('Model to chat with:', model)

  const message = { role: 'user', content: content };
  const response = await ollama.chat({ model: model, messages: [message], stream: false });

  return response;
})

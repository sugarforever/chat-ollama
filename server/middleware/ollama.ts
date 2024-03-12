export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event);
  const host = (headers['x_ollama_host'] || 'http://localhost:11434').replace(/\/$/, '');
  const username = headers['x_ollama_username'] || '';
  const password = headers['x_ollama_password'] || '';

  console.log("Ollama: ", { host, username, password });
  event.context.ollama = { host, username, password }
})

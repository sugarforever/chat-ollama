export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event);
  const host = (headers['x_ollama_host'] || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const username = headers['x_ollama_username'] || null;
  const password = headers['x_ollama_password'] || null;

  console.log("Ollama: ", { host, username, password });
  event.context.ollama = { host, username, password }
})

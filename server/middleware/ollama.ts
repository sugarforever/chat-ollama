export default defineEventHandler((event) => {
  const headers = getRequestHeaders(event)
  const host = (headers['x-ollama-host'] || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const username = headers['x-ollama-username'] || null
  const password = headers['x-ollama-password'] || null

  console.log("Ollama: ", { host, username, password })
  event.context.ollama = { host, username, password }
})

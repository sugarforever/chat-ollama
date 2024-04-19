export default defineEventHandler((event) => {

  const headers = getRequestHeaders(event)

  let ollamaServer: any = headers['x_ollama_host']

  console.log(`Ollama Server : ${ollamaServer}`)

  if (!headers['x_ollama_host']) {
    ollamaServer = process.env.OLLAMA_HOST
  }

  if (!ollamaServer) {
    ollamaServer = 'http://127.0.0.1:11434'
  }

  const host = ollamaServer.replace(/\/$/, '')
  const username = headers['x_ollama_username'] || null
  const password = headers['x_ollama_password'] || null

  console.log("Ollama: ", { host, username, password })
  event.context.ollama = { host, username, password }
})

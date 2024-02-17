const OLLAMA_HOST = 'ollama.host';

export const loadOllamaHost = () => {
  const host = localStorage.getItem(OLLAMA_HOST);
  return host;
}

export const saveOllamaHost = (host) => {
  localStorage.setItem(OLLAMA_HOST, host);
}

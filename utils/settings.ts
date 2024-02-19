const OLLAMA_HOST = 'ollama.host';
const OLLAMA_USERNAME = 'ollama.username';
const OLLAMA_PASSWORD = 'ollama.password';

export const loadOllamaHost = () => {
  const host = localStorage.getItem(OLLAMA_HOST);
  return host;
}

export const saveOllamaHost = (host: string) => {
  if (host) {
    localStorage.setItem(OLLAMA_HOST, host);
  } else {
    localStorage.removeItem(OLLAMA_HOST);
  }
}

export const loadOllamaUserName = () => {
  const host = localStorage.getItem(OLLAMA_USERNAME);
  return host;
}

export const saveOllamaUserName = (username: string) => {
  if (username) {
    localStorage.setItem(OLLAMA_USERNAME, username);
  } else {
    localStorage.removeItem(OLLAMA_USERNAME);
  }
}

export const loadOllamaPassword = () => {
  const host = localStorage.getItem(OLLAMA_PASSWORD);
  return host;
}

export const saveOllamaPassword = (password: string) => {
  if (password) {
    localStorage.setItem(OLLAMA_PASSWORD, password);
  } else {
    localStorage.removeItem(OLLAMA_PASSWORD);
  }
}
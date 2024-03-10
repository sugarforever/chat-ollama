const OLLAMA_HOST = "ollama.host";
const OLLAMA_USERNAME = "ollama.username";
const OLLAMA_PASSWORD = "ollama.password";
export const OPENAI_API_KEY = "keys.openai_api_key";
export const ANTHROPIC_API_KEY = "keys.anthropic_api_key";

export const loadKey = (name: string) => {
  return localStorage.getItem(name);
};

export const saveKey = (name: string, value: string | null) => {
  if (value) {
    localStorage.setItem(name, value);
  } else {
    localStorage.removeItem(name);
  }
};

export const loadOllamaHost = () => {
  const host = localStorage.getItem(OLLAMA_HOST);
  return host;
};

export const saveOllamaHost = (host: string) => {
  if (host) {
    localStorage.setItem(OLLAMA_HOST, host);
  } else {
    localStorage.removeItem(OLLAMA_HOST);
  }
};

export const loadOllamaUserName = () => {
  const host = localStorage.getItem(OLLAMA_USERNAME);
  return host;
};

export const saveOllamaUserName = (username: string) => {
  if (username) {
    localStorage.setItem(OLLAMA_USERNAME, username);
  } else {
    localStorage.removeItem(OLLAMA_USERNAME);
  }
};

export const loadOllamaPassword = () => {
  const host = localStorage.getItem(OLLAMA_PASSWORD);
  return host;
};

export const saveOllamaPassword = (password: string) => {
  if (password) {
    localStorage.setItem(OLLAMA_PASSWORD, password);
  } else {
    localStorage.removeItem(OLLAMA_PASSWORD);
  }
};

export const loadOllamaInstructions = async () => {
  try {
    const { instructions } = (await $fetch(`/api/instruction/`, {
      method: "GET",
    })) as Record<string, any>;
    return instructions;
  } catch (e) {
    console.error("Failed to fetch Ollama instructions", e);
  }
};

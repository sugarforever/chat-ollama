const OLLAMA_HOST = 'ollama.host';
const OLLAMA_USERNAME = 'ollama.username';
const OLLAMA_PASSWORD = 'ollama.password';
const OLLAMA_INSTRUCTIONS = 'ollama.instructions';

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

export const loadOllamaInstructions = () => {
  const instructions = localStorage.getItem(OLLAMA_INSTRUCTIONS);
  if (instructions) {
    try {
      return JSON.parse(instructions);
    } catch (e) {
      console.error('Failed to parse Ollama instructions', e);
      return [];
    }
  } else {
    return [];
  }
}

export const saveOllamaInstruction = (name, instruction) => {
  const instructions = loadOllamaInstructions();
  const existing = instructions.find((i) => i.name === name);
  if (existing) {
    existing.instruction = instruction;
  } else {
    instructions.push({ name, instruction });
  }

  localStorage.setItem(OLLAMA_INSTRUCTIONS, JSON.stringify(instructions));
}

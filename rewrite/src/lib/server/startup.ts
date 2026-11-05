import { resolve } from "node:path";
import { createSessionManager } from "./runtime/manager";
// SvelteKit routes and the custom Node entrypoint are separate bundles.
// Store the owner on the process global so both resolve the same runtime.
const processState = globalThis as typeof globalThis & {
  __chatOllamaRuntime?: ReturnType<typeof start>;
};
async function start() {
  const manager = createSessionManager({
    directory: resolve(process.env.DATA_DIR || "data", "sessions"),
    endpoint: {
      baseUrl: process.env.CHAT_BASE_URL || "http://127.0.0.1:11434/v1",
      apiKey: process.env.CHAT_API_KEY || "",
      modelId: process.env.CHAT_MODEL_ID || "local",
    },
  });
  await manager.resume();
  return manager;
}
export function startup() {
  return (processState.__chatOllamaRuntime ??= start());
}

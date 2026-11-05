import { knowledge } from "./knowledge";
import { loadMcpServers } from "./mcp/config";
import { loadChatConfig } from "./settings";
import { resolve } from "node:path";
import { createSessionManager } from "./runtime/manager";
// SvelteKit routes and the custom Node entrypoint are separate bundles.
// Store the owner on the process global so both resolve the same runtime.
const processState = globalThis as typeof globalThis & {
  __chatOllamaRuntime?: ReturnType<typeof start>;
};
async function start() {
  const sources = knowledge();
  const manager = createSessionManager({
    directory: resolve(process.env.DATA_DIR || "data", "sessions"),
    endpoint: loadChatConfig(),
    loadEndpoint: loadChatConfig,
    loadMcpConfigs: loadMcpServers,
    createTools: (config) =>
      config.knowledgeBaseIds.length
        ? [sources.createKnowledgeTool(config.knowledgeBaseIds)]
        : [],
  });
  await manager.resume();
  return {
    ...manager,
    async close() {
      await manager.close();
      await sources.close();
    },
  };
}
export function startup() {
  return (processState.__chatOllamaRuntime ??= start());
}

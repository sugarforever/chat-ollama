import { closeOwners } from "./lifecycle";
import { openGoalRuntime } from "./goals/runtime";
import { skillStore } from "./skills/store";
import { knowledge } from "./knowledge";
import { loadMcpServers } from "./mcp/config";
import { loadChatConfig, loadProviders, resolveChatEndpoint } from "./settings";
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
    resolveEndpoint: resolveChatEndpoint,
    defaultProviderId: () => loadProviders().defaultProviderId,
    loadMcpConfigs: loadMcpServers,
    loadSkillContext: (config) => skillStore().context(config.excludedSkillIds),
    createTools: (config) =>
      config.knowledgeBaseIds.length
        ? [sources.createKnowledgeTool(config.knowledgeBaseIds)]
        : [],
  });
  let goals;
  try {
    await manager.resume();
    goals = await openGoalRuntime({ file: resolve(process.env.DATA_DIR || "data", "goals.sqlite"), resolveEndpoint: resolveChatEndpoint });
  } catch (error) { await closeOwners([() => manager.close(), () => sources.close()]).catch(() => {}); throw error; }
  return {
    goals,
    ...manager,
    async close() {
      await closeOwners([() => goals.close(), () => manager.close(), () => sources.close()]);
    },
  };
}
export function startup() {
  return (processState.__chatOllamaRuntime ??= start());
}

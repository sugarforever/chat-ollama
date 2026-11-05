import { createSessionManager } from "../../src/lib/server/runtime/manager.ts";
const manager = createSessionManager({
  directory: process.env.DATA_DIR!,
  endpoint: { baseUrl: process.env.BASE_URL!, apiKey: "x", modelId: "fixture" },
  mcpConfigs: [JSON.parse(process.env.MCP_CONFIG!)],
});
const { openCatalogue } = await import("../../src/lib/server/db/index.ts");
const db = openCatalogue(process.env.DATA_DIR! + "/catalogue.sqlite");
db.insert("crash", {
  modelId: "fixture",
  knowledgeBaseIds: [],
  mcpServerIds: ["fixture"],
});
db.close();
const s = await manager.openSession("crash");
process.on("message", async () => {
  await s.submit("first", "do effect");
});
process.send?.("ready");

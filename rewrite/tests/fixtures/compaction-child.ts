import { createSessionManager } from "../../src/lib/server/runtime/manager.ts";
import { captureModel } from "../../src/lib/server/providers.ts";
const baseUrl = process.env.BASE_URL!;
const model = { ...captureModel("custom", "fixture", baseUrl), contextWindow: Number(process.env.WINDOW || 16384), maxTokens: 1024 };
const endpoint = { baseUrl, apiKey: "test", modelId: "fixture", model };
const manager = createSessionManager({
  directory: process.env.DATA_DIR!, endpoint, loadEndpoint: () => endpoint,
});
await manager.resume();
const session = await manager.openSession("one");
process.on("message", async (message: any) => {
  try {
    if (message.close) { await manager.close(); process.exit(0); }
    if (message.snapshot) { process.send?.({ snapshot: await session.snapshot() }); return; }
    await session.submit(message.id, message.content);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const snapshot = await session.snapshot();
      if (snapshot.status !== "running") {
        process.send?.({ snapshot });
        return;
      }
      await new Promise(r => setTimeout(r, 10));
    }
    throw Error("Run timeout");
  } catch (error) { process.send?.({ error: String(error) }); }
});
process.send?.({ ready: true });

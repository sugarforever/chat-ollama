import { createSessionManager } from "../../src/lib/server/runtime/manager.ts";
const manager = createSessionManager({
  directory: process.env.DATA_DIR!,
  endpoint: {
    baseUrl: process.env.BASE_URL!,
    apiKey: "fixture-secret",
    modelId: "fixture",
  },
});
const observers = new Map<string, () => void>();
process.on(
  "message",
  async (command: {
    command: string;
    id: string;
    requestId?: string;
    content?: string;
  }) => {
    try {
      const session = await manager.openSession(command.id);
      if (command.command === "submit")
        await session.submit(command.requestId!, command.content!);
      if (command.command === "stop") await session.stop();
      if (command.command === "watch")
        observers.set(
          command.id,
          session.watch((snapshot) =>
            process.send?.({ event: "snapshot", id: command.id, snapshot }),
          ),
        );
      if (command.command === "detach") {
        observers.get(command.id)?.();
        observers.delete(command.id);
      }
      if (command.command === "close") {
        await manager.close();
        process.exit(0);
      }
      process.send?.({
        event: command.command,
        id: command.id,
        snapshot: await session.snapshot(),
      });
    } catch (error) {
      process.send?.({ event: "error", error: String(error) });
    }
  },
);
await manager.resume();
process.send?.({ event: "ready" });

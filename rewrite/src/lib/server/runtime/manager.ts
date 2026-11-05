import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  openAgentSession,
  type AgentSession,
  type ChatEndpointConfig,
} from "./session";
export function createSessionManager(options: {
  directory: string;
  endpoint: ChatEndpointConfig;
}) {
  const sessions = new Map<string, Promise<AgentSession>>();
  let closed = false;
  function openSession(id: string): Promise<AgentSession> {
    if (closed) return Promise.reject(new Error("Runtime is closed"));
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      return Promise.reject(new Error("Invalid conversation ID"));
    const existing = sessions.get(id);
    if (existing) return existing;
    const opening = (async () => {
      await mkdir(options.directory, { recursive: true });
      return openAgentSession(
        id,
        join(options.directory, `${id}.sqlite`),
        options.endpoint,
      );
    })();
    sessions.set(id, opening);
    void opening.catch(() => {
      if (sessions.get(id) === opening) sessions.delete(id);
    });
    return opening;
  }
  return {
    openSession,
    async resume() {
      await mkdir(options.directory, { recursive: true });
      for (const file of await readdir(options.directory)) {
        if (file.endsWith(".sqlite")) await openSession(file.slice(0, -7));
      }
    },
    async close() {
      closed = true;
      const opened = await Promise.allSettled(sessions.values());
      await Promise.all(
        opened
          .filter((x) => x.status === "fulfilled")
          .map((x) => x.value.close()),
      );
      sessions.clear();
    },
  };
}

import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import type { ConversationSnapshot, PublicEntry } from "../../contracts";
export type ChatEndpointConfig = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
};
export interface AgentSession {
  snapshot(): Promise<ConversationSnapshot>;
  submit(requestId: string, content: string): Promise<{ id: string }>;
  stop(): Promise<void>;
  watch(listener: (snapshot: ConversationSnapshot) => void): () => void;
  close(): Promise<void>;
}
export async function openAgentSession(
  id: string,
  file: string,
  endpoint: ChatEndpointConfig,
): Promise<AgentSession> {
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "chat",
      baseUrl: endpoint.baseUrl,
      auth: {
        apiKey: {
          name: "Configured API key",
          async resolve() {
            return { auth: { apiKey: endpoint.apiKey || "local" } };
          },
        },
      },
      api: openAICompletionsApi(),
      models: [
        {
          id: endpoint.modelId,
          name: endpoint.modelId,
          api: "openai-completions",
          provider: "chat",
          baseUrl: endpoint.baseUrl,
          input: ["text"],
          reasoning: false,
          contextWindow: 32768,
          maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ],
    }),
  );
  const storage = await openNodeSqliteStorage(file);
  let harness;
  try {
    harness = await Harness.open(
      storage,
      { models, registry: createRegistry() },
      context,
    );
  } catch (error) {
    await storage.close(context);
    throw error;
  }
  try {
    const root = await harness.root(context, {
      agent: { model: { provider: "chat", modelId: endpoint.modelId } },
    });
    const committed = await root.watch(context);
    let revision = 0;
    const listeners = new Set<(snapshot: ConversationSnapshot) => void>();
    function snapshot(): ConversationSnapshot {
      const view = committed.value;
      const live = view.docs["pi.live"];
      const entries: PublicEntry[] = view.entries.flatMap((entry) => {
        const kind =
          entry.kind === "pi.user"
            ? "user"
            : entry.kind === "pi.assistant"
              ? "assistant"
              : entry.kind === "pi.tool-result"
                ? "tool"
                : undefined;
        if (!kind) return [];
        const content = (entry.model ?? [])
          .map((message) =>
            typeof message.content === "string"
              ? message.content
              : message.content
                  .map((part) => ("text" in part ? part.text : ""))
                  .join(""),
          )
          .join("");
        return [{ id: String(entry.id), kind, content }];
      });
      return {
        id,
        revision: String(revision),
        status: live?.run ? "running" : live?.runFailure ? "failed" : "idle",
        entries,
      };
    }
    committed.start(async () => {
      revision++;
      for (const listener of listeners) {
        try {
          listener(snapshot());
        } catch {
          /* A browser listener cannot fail the runtime watch. */
        }
      }
    });
    harness.resume();
    return {
      async snapshot() {
        return structuredClone(snapshot());
      },
      async submit(requestId, content) {
        const admission = await root.submit(
          { type: "input", requestId, content, whenBusy: "reject" },
          context,
        );
        return { id: String(admission.id) };
      },
      async stop() {
        await root.abort(context);
      },
      watch(listener) {
        listeners.add(listener);
        listener(snapshot());
        return () => {
          listeners.delete(listener);
        };
      },
      async close() {
        listeners.clear();
        await committed.stop();
        await harness.close(context);
      },
    };
  } catch (error) {
    await harness.close(context);
    throw error;
  }
}

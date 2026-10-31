import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import {
  Harness,
  createRegistry,
  ConversationBusy,
  type LiveState,
  type SubmissionRecord,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { projectState } from "./projection";
import { ApiError } from "../errors";
import type { ConversationSnapshot } from "../../contracts";
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
  loadEndpoint?: () => ChatEndpointConfig,
): Promise<AgentSession> {
  const models = createModels();
  function configure(value: ChatEndpointConfig) {
    endpoint = value;
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
  }
  configure(endpoint);
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
    let latest: SubmissionRecord | undefined = (
      await storage.scanSubmissions(
        { conversationId: root.id, order: "descending" },
        1,
        undefined,
        context,
      )
    ).items[0];
    const cancelling = new Set<number>();
    const initialRun = (
      committed.value.docs["pi.live"] as LiveState | undefined
    )?.run;
    if (
      initialRun &&
      (await harness.getTask(initialRun.taskId, context))?.abortRequested
    )
      cancelling.add(initialRun.taskId);
    const listeners = new Set<(snapshot: ConversationSnapshot) => void>();
    let closed = false;
    function snapshot(): ConversationSnapshot {
      const view = committed.value;
      const live = view.docs["pi.live"] as LiveState | undefined;
      return projectState({
        id,
        revision: String(revision),
        entries: view.entries,
        live,
        latest,
        abortRequested: live?.run && cancelling.has(live.run.taskId),
      });
    }
    function publish() {
      if (closed) return;
      revision++;
      for (const listener of listeners) {
        try {
          listener(structuredClone(snapshot()));
        } catch {
          /* Isolate disconnected browsers. */
        }
      }
    }
    // Outcomes and abort marks are durable tables, not fields on pi.live.
    // The observer only reads the publication; it never re-enters Session APIs.
    const detachCommits = harness.subscribeCommits((publication) => {
      let changed = false;
      for (const change of publication.changes) {
        if (
          change.type === "submission" &&
          change.value.conversationId === root.id &&
          (!latest || change.value.id >= latest.id)
        ) {
          latest = change.value;
          changed = true;
        }
        if (change.type === "task") {
          if (
            change.value.abortRequested &&
            change.value.state.status !== "terminal"
          )
            cancelling.add(change.value.id);
          else cancelling.delete(change.value.id);
          changed = true;
        }
      }
      if (changed) queueMicrotask(publish);
    });
    committed.start(async () => {
      publish();
    });
    harness.resume();
    let admissionLine: Promise<unknown> = Promise.resolve();
    return {
      async snapshot() {
        return structuredClone(snapshot());
      },
      submit(requestId, content) {
        const admitted = admissionLine.then(async () => {
          // pi commits the request ID and immutable user entry together. There is no
          // application admission write to lose if the process dies after submit.
          const previous = await storage.submissionByRequest(
            root.id,
            requestId,
            context,
          );
          if (previous) {
            const entry =
              previous.entry === undefined
                ? undefined
                : await storage.entry(previous.entry, context);
            const original = entry?.entry.model?.[0]?.content;
            if (previous.type !== "input" || original !== content)
              throw new ApiError(
                409,
                "REQUEST_CONFLICT",
                "Request ID was already used with different content",
              );
            return { id: String(previous.id) };
          }
          if (
            loadEndpoint &&
            !["running", "cancelling"].includes(snapshot().status)
          ) {
            configure(loadEndpoint());
            await root.configure(
              { model: { provider: "chat", modelId: endpoint.modelId } },
              context,
            );
          }
          try {
            const admission = await root.submit(
              { type: "input", requestId, content, whenBusy: "reject" },
              context,
            );
            return { id: String(admission.id) };
          } catch (error) {
            if (error instanceof ConversationBusy)
              throw new ApiError(409, "BUSY", "Conversation is busy");
            throw error;
          }
        });
        admissionLine = admitted.catch(() => {});
        return admitted;
      },
      async stop() {
        await root.abort(context);
      },
      watch(listener) {
        listeners.add(listener);
        try {
          listener(snapshot());
        } catch (error) {
          listeners.delete(listener);
          throw error;
        }
        return () => {
          listeners.delete(listener);
        };
      },
      async close() {
        closed = true;
        detachCommits();
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

import { mkdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createMcpTools, type RuntimeTool } from "../mcp/tools";
import { openMcpBarrier } from "../mcp/barrier";
import type { McpConfig } from "../mcp/client";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  runtimeProvider,
  runtimeCredentialStore,
  runtimeAuthContext,
} from "./provider";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  Harness,
  createRegistry,
  hook,
  GenerationTask,
  ConversationBusy,
  type LiveState,
  type SubmissionRecord,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { projectState } from "./projection";
import { ApiError } from "../errors";
import type { ConversationSnapshot, ProviderSelection } from "../../contracts";
export type ChatEndpointConfig = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  models?: string[];
  useAmbientCredentials?: boolean;
  service?: string;
  authMode?: import("../providers").AuthMode;
  protocol?: import("../providers").CustomProtocol;
  credentialEnv?: Record<string, string>;
  credentialId?: string;
  model?: import("@earendil-works/pi-ai").Model<
    import("@earendil-works/pi-ai").Api
  >;
};
export interface AgentSession {
  configurationChanged(): void;
  snapshot(): Promise<ConversationSnapshot>;
  submit(requestId: string, content: string): Promise<{ id: string }>;
  stop(): Promise<void>;
  acknowledgeInterruption(): Promise<void>;
  watch(listener: (snapshot: ConversationSnapshot) => void): () => void;
  close(): Promise<void>;
}
export async function openAgentSession(
  id: string,
  file: string,
  endpoint: ChatEndpointConfig,
  loadEndpoint?: () => ChatEndpointConfig,
  toolOptions: {
    selection?: () => ProviderSelection;
    mcpServerIds?: string[];
    mcpConfigs?: McpConfig[];
    tools?: RuntimeTool[];
    loadMcpConfigs?: () => McpConfig[];
  } = {},
): Promise<AgentSession> {
  const workspace = join(dirname(file), "workspaces", basename(file, ".sqlite"));
  await mkdir(workspace, { recursive: true });
  const barrier = openMcpBarrier(`${file}.mcp.sqlite`);
  const manifestFile = `${file}.mcp-tools.json`;
  function saveManifest() {
    writeFileSync(`${manifestFile}.tmp`, JSON.stringify(mcp.descriptors), {
      mode: 0o600,
    });
    renameSync(`${manifestFile}.tmp`, manifestFile);
  }
  let mcp: Awaited<ReturnType<typeof createMcpTools>>;
  try {
    mcp = await createMcpTools(
      toolOptions.mcpServerIds ?? [],
      toolOptions.mcpConfigs ?? [],
      barrier,
      existsSync(manifestFile)
        ? JSON.parse(readFileSync(manifestFile, "utf8"))
        : undefined,
    );
    saveManifest();
  } catch (error) {
    barrier.close();
    throw error;
  }
  const registry = createRegistry();
  registry.install(CodingTools);
  let abortUncertainRun: () => Promise<void> = async () => {};
  const hooks = [
    hook(GenerationTask, {
      async beforeRequest(_request, _api, hookContext) {
        if (barrier.uncertainty()) {
          // Conversation.abort waits for idle; never await our own task here.
          void abortUncertainRun().catch(() => {});
          const signal = hookContext.abortSignal;
          if (signal && !signal.aborted)
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          throw new ApiError(
            409,
            "MCP_UNCERTAIN",
            "Acknowledge the uncertain MCP action before continuing",
          );
        }
        return undefined;
      },
    }),
  ];
  registry.install({
    name: "application",
    hooks,
    tools: [...mcp.tools, ...(toolOptions.tools ?? [])],
  });
  const models = createModels({
    credentials: runtimeCredentialStore(() => endpoint),
    authContext: runtimeAuthContext(() => endpoint),
  });
  function configure(value: ChatEndpointConfig) {
    endpoint = value;
    models.setProvider(runtimeProvider(value));
  }
  configure(endpoint);
  const storage = await openNodeSqliteStorage(file);
  let harness;
  try {
    harness = await Harness.open(storage, {
      models,
      registry,
      env: () => new NodeExecutionEnv({ cwd: workspace }),
    }, context);
  } catch (error) {
    await storage.close(context);
    await mcp.close();
    barrier.close();
    throw error;
  }
  try {
    const root = await harness.root(context, {
      agent: { model: { provider: "chat", modelId: endpoint.modelId } },
    });
    abortUncertainRun = () => root.abort(context);
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
      const result = projectState({
        id,
        revision: String(revision),
        entries: view.entries,
        live,
        latest,
        abortRequested: live?.run && cancelling.has(live.run.taskId),
      });
      const uncertainty = barrier.uncertainty();
      if (uncertainty) {
        result.mcpUncertainty = uncertainty;
        result.status = "interrupted";
      }
      if (toolOptions.selection) result.selection = toolOptions.selection();
      return result;
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
    const commitObservation = harness.observeCommits({
      advance(publication) {
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
      },
      end() {},
    });
    committed.start(async () => {
      barrier.committed(
        committed.value.entries.flatMap((e) =>
          (e.model ?? []).flatMap((m) =>
            m.role === "toolResult" ? [m.toolCallId] : [],
          ),
        ),
      );
      publish();
    });
    harness.resume();
    let admissionLine: Promise<unknown> = Promise.resolve();
    return {
      configurationChanged: publish,
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
          if (barrier.uncertainty())
            throw new ApiError(
              409,
              "MCP_UNCERTAIN",
              "Acknowledge the uncertain MCP action first",
            );
          if (
            toolOptions.loadMcpConfigs &&
            !["running", "cancelling"].includes(snapshot().status)
          ) {
            const next = await createMcpTools(
              toolOptions.mcpServerIds ?? [],
              toolOptions.loadMcpConfigs(),
              barrier,
            );
            await mcp.close();
            mcp = next;
            saveManifest();
            registry.install({
              name: "application",
              hooks,
              tools: [...mcp.tools, ...(toolOptions.tools ?? [])],
            });
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
          if (
            endpoint.service &&
            endpoint.service !== "custom" &&
            !["running", "cancelling"].includes(snapshot().status)
          ) {
            try {
              if (
                !(await models.getAuth("chat", {
                  signal: AbortSignal.timeout(30000),
                }))
              )
                throw Error("Not configured");
            } catch {
              throw new ApiError(
                401,
                "AUTH_REQUIRED",
                "Connect this provider in Settings before sending",
              );
            }
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
      async acknowledgeInterruption() {
        if ((committed.value.docs["pi.live"] as LiveState | undefined)?.run)
          throw new ApiError(
            409,
            "BUSY",
            "Wait for the interrupted run to settle",
          );
        barrier.acknowledge();
        publish();
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
        commitObservation.detach();
        listeners.clear();
        await committed.stop();
        await harness.close(context);
        await mcp.close();
        barrier.close();
      },
    };
  } catch (error) {
    await harness.close(context);
    await mcp.close();
    barrier.close();
    throw error;
  }
}

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createModels } from "@earendil-works/pi-ai/models";
import type { AuthEvent, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import {
  loadProviders,
  saveSettings,
  appDatabase,
  rotateProviderCredential,
} from "./settings";
import { nativeProvider } from "./providers";
import { credentialStore, readCredential } from "./provider-credentials";
import { ApiError } from "./errors";
export type PublicFlow = {
  id: string;
  status: "pending" | "connected" | "failed" | "cancelled";
  events: AuthEvent[];
  prompt?: Omit<AuthPrompt, "signal"> & { id: string };
  message?: string;
};
type Flow = {
  view: PublicFlow;
  controller: AbortController;
  answer?: (value: string) => void;
  slot: string;
};
const state = globalThis as typeof globalThis & {
  __chatOllamaAuthFlows?: Map<string, Flow>;
};
const flows = (state.__chatOllamaAuthFlows ??= new Map<string, Flow>());
const key = (id: string) => `${resolve(process.env.DATA_DIR || "data")}:${id}`;
function provider(id: string) {
  const p = loadProviders().providers.find((p) => p.id === id);
  if (!p?.service || p.service === "custom")
    throw new ApiError(400, "INVALID_INPUT", "Select a built-in provider");
  return p;
}
export function authStatus(id: string) {
  const p = provider(id);
  const stored = p.credentialId ? readCredential(p.credentialId) : undefined;
  const flow = flows.get(key(id));
  return {
    connected:
      p.authMode === "oauth"
        ? stored?.type === "oauth"
        : !!(p.apiKey || stored),
    mode: p.authMode,
    ...(stored?.type === "oauth" ? { expiresAt: stored.expires } : {}),
    ...(flow && flow.slot === p.credentialId
      ? { flow: structuredClone(flow.view) }
      : {}),
  };
}
export function startLogin(id: string, type: AuthType) {
  const p = provider(id);
  if (type !== p.authMode || !["api_key", "oauth"].includes(type))
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Authentication mode does not match",
    );
  const native = nativeProvider(p.service!);
  if (
    !(type === "oauth" ? native.auth.oauth?.login : native.auth.apiKey?.login)
  )
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "This mode uses server credentials",
    );
  flows.get(key(id))?.controller.abort();
  const controller = new AbortController();
  const flow: Flow = {
    controller,
    slot: rotateProviderCredential(id),
    view: { id: randomUUID(), status: "pending", events: [] },
  };
  flows.set(key(id), flow);
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  timer.unref();
  const store = credentialStore(flow.slot);
  const models = createModels({
    credentials: {
      ...store,
      async modify(pid, fn, options) {
        return store.modify(
          pid,
          async (current) => {
            controller.signal.throwIfAborted();
            const live = provider(id);
            if (live.credentialId !== flow.slot || live.authMode !== type)
              throw Error("Configuration changed");
            return fn(current);
          },
          options,
        );
      },
    },
  });
  models.setProvider(native);
  void models
    .login(
      native.id,
      type,
      {
        signal: controller.signal,
        notify(event) {
          if (controller.signal.aborted) return;
          flow.view.events = [...flow.view.events.slice(-19), event];
        },
        prompt(prompt) {
          return new Promise<string>((accept, reject) => {
            const promptId = randomUUID();
            const { signal, ...publicPrompt } = prompt;
            flow.view.prompt = { ...publicPrompt, id: promptId };
            const cleanup = () => {
              controller.signal.removeEventListener("abort", abort);
              signal?.removeEventListener("abort", abort);
              if (flow.view.prompt?.id === promptId) {
                delete flow.view.prompt;
                delete flow.answer;
              }
            };
            const abort = () => {
              cleanup();
              reject(Error("Login cancelled"));
            };
            controller.signal.addEventListener("abort", abort, { once: true });
            signal?.addEventListener("abort", abort, { once: true });
            flow.answer = (value) => {
              cleanup();
              accept(value);
            };
            if (controller.signal.aborted || signal?.aborted) abort();
          });
        },
      },
      { agentName: "ChatOllama", getDeviceId: installationId },
    )
    .then(
      () => {
        flow.view.status = "connected";
        flow.view.events = [];
      },
      () => {
        flow.view.status = controller.signal.aborted ? "cancelled" : "failed";
        flow.view.events = [];
        flow.view.message = controller.signal.aborted
          ? "Login cancelled. Start again to reconnect."
          : "Authentication failed. Check your account and credentials, then reconnect.";
      },
    )
    .finally(() => {
      clearTimeout(timer);
      delete flow.view.prompt;
      delete flow.answer;
    });
  return authStatus(id);
}
export function answerLogin(
  id: string,
  flowId: string,
  promptId: string,
  value: string,
) {
  provider(id);
  const f = flows.get(key(id));
  if (
    !f ||
    f.view.id !== flowId ||
    f.view.prompt?.id !== promptId ||
    !f.answer ||
    typeof value !== "string" ||
    value.length > 16384
  )
    throw new ApiError(
      409,
      "AUTH_STALE",
      "Login prompt expired; refresh status",
    );
  f.answer(value);
  return authStatus(id);
}
export function cancelLogin(id: string) {
  provider(id);
  const f = flows.get(key(id));
  if (f) {
    f.controller.abort();
    f.view.status = "cancelled";
    delete f.view.prompt;
    delete f.answer;
  }
  return authStatus(id);
}
export async function disconnectProvider(id: string) {
  const p = provider(id);
  cancelLogin(id);
  if (p.credentialId) await credentialStore(p.credentialId).delete(p.service!);
  const saved = loadProviders();
  saveSettings({
    providers: saved.providers.map(
      ({ apiKey, credentialEnv, credentialId, ...configuration }) =>
        configuration.id === id
          ? { ...configuration, apiKey: "", credentialEnv: {} }
          : configuration,
    ),
  });
  const f = flows.get(key(id));
  if (f) f.slot = provider(id).credentialId!;
  return authStatus(id);
}
function installationId() {
  const db = appDatabase();
  try {
    db.prepare(
      "INSERT OR IGNORE INTO settings VALUES ('installation-id',?)",
    ).run(randomUUID());
    return (
      db
        .prepare("SELECT value FROM settings WHERE kind='installation-id'")
        .get() as { value: string }
    ).value;
  } finally {
    db.close();
  }
}

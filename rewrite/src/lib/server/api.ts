import { json } from "@sveltejs/kit";
import { ApiError } from "./errors";
import type { ConversationConfig } from "../contracts";

const publicErrors: Record<string, [number, string]> = {
  KNOWLEDGE_NOT_FOUND: [404, "Knowledge source or collection not found"],
  REINDEX_REQUIRED: [
    409,
    "Embedding configuration changed; explicit reindex required",
  ],
  KNOWLEDGE_BUSY: [429, "Knowledge indexing or search is busy; retry shortly"],
  UNSUPPORTED_DOCUMENT: [415, "Upload a text-based PDF, Markdown or text file"],
  UPLOAD_TOO_LARGE: [413, "Upload limit is 10 MiB"],
  MCP_CONNECTION: [
    502,
    "Cannot connect or discover MCP server; check selected server configuration, address, command and authentication headers. OAuth setup is outside v1.",
  ],
  MCP_UNCERTAIN: [
    409,
    "Acknowledge the uncertain MCP action before continuing",
  ],
  PROVIDER_NOT_FOUND: [
    409,
    "Selected provider is unavailable; choose a provider in this conversation",
  ],
  AUTH_STALE: [409,"Login prompt expired; refresh status"],
  AUTH_REQUIRED: [401,"Connect this provider in Settings before sending"],
  MODEL_NOT_FOUND: [400,"Select a model from this service catalog"],
  INVALID_ID: [400, "Invalid conversation ID"],
  INVALID_INPUT: [400, "Invalid request input"],
  NOT_FOUND: [404, "Conversation not found"],
  BUSY: [409, "Conversation is busy"],
  REQUEST_CONFLICT: [409, "Request ID was already used with different content"],
};

export async function api(action: () => Response | Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    // Node bootstrap and SvelteKit independently bundle application classes.
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (Object.hasOwn(publicErrors, code)) {
      const [status, message] = publicErrors[code];
      return json({ error: { code, message } }, { status });
    }
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed",
        },
      },
      { status: 500 },
    );
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {
    /* Invalid JSON uses the same public validation error. */
  }
  throw new ApiError(400, "INVALID_INPUT", "Expected a JSON object");
}

export function config(value: Record<string, unknown>): ConversationConfig {
  if (
    typeof value.modelId !== "string" ||
    !value.modelId.trim() ||
    value.modelId.length > 200 ||
    !Array.isArray(value.knowledgeBaseIds) ||
    !value.knowledgeBaseIds.every((x) => typeof x === "string") ||
    !Array.isArray(value.mcpServerIds) ||
    !value.mcpServerIds.every((x) => typeof x === "string")
  ) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Invalid conversation configuration",
    );
  }
  if (
    value.providerId !== undefined &&
    (typeof value.providerId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(value.providerId))
  )
    throw new ApiError(400, "INVALID_INPUT", "Invalid provider");
  return {
    ...(value.providerId === undefined
      ? {}
      : { providerId: value.providerId as string }),
    modelId: value.modelId,
    knowledgeBaseIds: value.knowledgeBaseIds,
    mcpServerIds: value.mcpServerIds,
  };
}

export function selection(value: Record<string, unknown>) {
  if (
    typeof value.providerId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value.providerId) ||
    typeof value.modelId !== "string" ||
    !value.modelId.trim() ||
    value.modelId.length > 200
  )
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Invalid provider and model selection",
    );
  return { providerId: value.providerId, modelId: value.modelId };
}

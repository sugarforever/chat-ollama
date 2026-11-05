import { json } from '@sveltejs/kit';
import { ApiError } from './errors';
import type { ConversationConfig } from '../contracts';

const publicErrors: Record<string, [number, string]> = {
  INVALID_ID: [400, 'Invalid conversation ID'],
  INVALID_INPUT: [400, 'Invalid request input'],
  NOT_FOUND: [404, 'Conversation not found'],
  BUSY: [409, 'Conversation is busy'],
  REQUEST_CONFLICT: [409, 'Request ID was already used with different content'],
};

export async function api(action: () => Response | Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    // Node bootstrap and SvelteKit independently bundle application classes.
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code) : '';
    if (Object.hasOwn(publicErrors, code)) {
      const [status, message] = publicErrors[code];
      return json({ error: { code, message } }, { status });
    }
    return json({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed' },
    }, { status: 500 });
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Invalid JSON uses the same public validation error. */ }
  throw new ApiError(400, 'INVALID_INPUT', 'Expected a JSON object');
}

export function config(value: Record<string, unknown>): ConversationConfig {
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 200 ||
    !Array.isArray(value.knowledgeBaseIds) || !value.knowledgeBaseIds.every(x => typeof x === 'string') ||
    !Array.isArray(value.mcpServerIds) || !value.mcpServerIds.every(x => typeof x === 'string')) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid conversation configuration');
  }
  return {
    modelId: value.modelId,
    knowledgeBaseIds: value.knowledgeBaseIds,
    mcpServerIds: value.mcpServerIds,
  };
}

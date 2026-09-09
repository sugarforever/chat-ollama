import { randomUUID } from 'node:crypto';

import { createLanguageModel, describeModel } from './model-registry.js';
import { createAgentSessionWithModel } from './session-core.js';
import type {
  AgentSession,
  CreateAgentSessionOptions,
} from './types.js';

export function createAgentSession(
  options: CreateAgentSessionOptions,
): AgentSession {
  return createAgentSessionWithModel({
    id: options.id ?? randomUUID(),
    model: createLanguageModel(options.model),
    descriptor: describeModel(options.model),
  });
}

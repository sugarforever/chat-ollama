import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationConfig } from '../../contracts';
import { openCatalogue } from '../db';
import { ApiError, validateConversationId } from '../errors';
import { openAgentSession, type AgentSession, type ChatEndpointConfig } from './session';
export function createSessionManager(options: { directory: string; endpoint: ChatEndpointConfig }) {
  const sessions = new Map<string, Promise<AgentSession>>();
  let closed = false;
  const catalogue = mkdir(options.directory, { recursive: true }).then(() =>
    openCatalogue(join(options.directory, 'catalogue.sqlite')),
  );
  async function openSession(id: string): Promise<AgentSession> {
    if (closed) throw new Error('Runtime is closed');
    validateConversationId(id);
    const existing = sessions.get(id);
    if (existing) return existing;
    const opening = (async () => {
      const db = await catalogue;
      let row = db.get(id);
      // Internal explicit creation for runtime consumers; HTTP reads use getSession.
      if (!row) {
        db.insert(id, { modelId: options.endpoint.modelId, knowledgeBaseIds: [], mcpServerIds: [] });
        row = db.get(id)!;
      }
      const session = await openAgentSession(id, join(options.directory, `${id}.sqlite`), { ...options.endpoint, modelId: row.config.modelId });
      db.ready(id);
      return session;
    })();
    sessions.set(id, opening);
    void opening.catch(() => {
      if (sessions.get(id) === opening) sessions.delete(id);
    });
    return opening;
  }
  return {
    openSession,
    async createConversation(config: ConversationConfig) {
      const id = randomUUID();
      validateConversationId(id);
      // Catalogue intent precedes session creation; startup completes interrupted creation.
      (await catalogue).insert(id, config);
      await openSession(id);
      return { id };
    },
    async getSession(id: string) {
      validateConversationId(id);
      if (!(await catalogue).get(id)) throw new ApiError(404, 'NOT_FOUND', 'Conversation not found');
      return openSession(id);
    },
    async listConversations() {
      return (await catalogue).list().map(({ id, config, createdAt }) => ({ id, config, createdAt }));
    },
    async resume() {
      for (const row of (await catalogue).list()) await openSession(row.id);
    },
    async close() {
      if (closed) return;
      closed = true;
      const opened = await Promise.allSettled(sessions.values());
      await Promise.all(opened.filter(x => x.status === 'fulfilled').map(x => x.value.close()));
      sessions.clear();
      (await catalogue).close();
    },
  };
}

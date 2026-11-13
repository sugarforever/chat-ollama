export type RunStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "interrupted"
  | "failed";
export type PublicEntry = {
  id: string;
  kind: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolError?: boolean;
  uncertain?: boolean;
  toolStatus?: "pending" | "running" | "done";
  partial?: boolean;
  timestamp?: number;
};
export type ConversationSnapshot = {
  id: string;
  revision: string;
  selection?: ProviderSelection;
  mcpUncertainty?: string;
  status: RunStatus;
  entries: PublicEntry[];
};
export type ProviderSelection = { providerId: string; modelId: string };
export type PublicProvider = {
  id: string;
  modelId: string;
  models?: string[];
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
  service?: string;
  authMode?: 'api_key' | 'oauth' | 'ambient' | 'none';
  protocol?: string;
};
export type ConversationConfig = {
  // Optional only for pre-provider catalogue records and older creation clients.
  providerId?: string;
  modelId: string;
  knowledgeBaseIds: string[];
  mcpServerIds: string[];
};
export type StateEvent = { type: "snapshot"; snapshot: ConversationSnapshot };
export type SearchHit = {
  sourceId: string;
  documentId: string;
  title: string;
  text: string;
  page?: number;
  score: number;
};

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
  uncertain?: boolean;
  toolStatus?: "pending" | "running" | "done";
  partial?: boolean;
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
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
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

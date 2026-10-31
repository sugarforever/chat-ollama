export type RunStatus =
  "idle" | "running" | "cancelling" | "interrupted" | "failed";
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
  status: RunStatus;
  entries: PublicEntry[];
};
export type ConversationConfig = {
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

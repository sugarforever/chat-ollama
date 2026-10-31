import type { ConversationSnapshot, PublicEntry } from '../../contracts';
import type { EntryRecord, LiveState, SubmissionRecord } from '@earendil-works/pi-durable';
export type ProjectionInput = { id: string; revision: string; entries: readonly EntryRecord[]; live?: LiveState; latest?: SubmissionRecord; abortRequested?: boolean };
export function projectState(raw: ProjectionInput): ConversationSnapshot {
  const completedCalls = new Set<string>();
  const entries: PublicEntry[] = raw.entries.flatMap<PublicEntry>(entry => {
    const kind = entry.kind === 'pi.user' ? 'user' : entry.kind === 'pi.assistant' ? 'assistant' : entry.kind === 'pi.tool-result' ? 'tool' : undefined;
    if (!kind) return [];
    const content = (entry.model ?? []).map(message => typeof message.content === 'string' ? message.content : message.content.map(part => 'text' in part ? part.text : '').join('')).join('');
    if (kind === 'tool') {
      const message = entry.model?.find(message => message.role === 'toolResult');
      if (message?.role === 'toolResult') completedCalls.add(message.toolCallId);
      const data = entry.data as { diagnostics?: { code?: string }[] } | undefined;
      const uncertain = data?.diagnostics?.some(diagnostic => diagnostic.code === 'interrupted') || undefined;
      return [{ id: String(entry.id), kind, content, toolName: message?.role === 'toolResult' ? message.toolName : undefined, toolStatus: 'done', ...(uncertain ? { uncertain } : {}) }];
    }
    return [{ id: String(entry.id), kind, content }];
  });
  const partial = raw.live?.generation?.message;
  if (partial) {
    const content = partial.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('');
    if (content) entries.push({ id: `assistant:${raw.live?.run?.taskId}`, kind: 'assistant', content, partial: true });
  }
  for (const tool of [...(raw.live?.tools ?? []), ...(raw.live?.nestedTools ?? [])]) {
    if (!completedCalls.has(tool.callId)) entries.push({ id: `tool:${tool.callId}`, kind: 'tool', toolName: tool.name, content: tool.output ?? '', toolStatus: tool.status });
  }
  const lastUser = entries.findLastIndex(entry => entry.kind === 'user');
  const uncertain = entries.slice(lastUser + 1).some(entry => entry.uncertain);
  let status: ConversationSnapshot['status'] = 'idle';
  if (raw.live?.run) status = raw.abortRequested ? 'cancelling' : 'running';
  else if (raw.latest?.status === 'unanswered' && raw.latest.reason !== 'aborted') status = ['orphaned', 'interrupted'].includes(raw.latest.reason) ? 'interrupted' : 'failed';
  else if (uncertain) status = 'interrupted';
  return { id: raw.id, revision: raw.revision, status, entries };
}

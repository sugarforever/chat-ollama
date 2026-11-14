import type { ConversationSnapshot, PublicEntry } from '../../contracts';
import type { EntryRecord, LiveState, SubmissionRecord } from '@earendil-works/pi-durable';
export type ProjectionInput = { id: string; revision: string; entries: readonly EntryRecord[]; live?: LiveState; latest?: SubmissionRecord; abortRequested?: boolean };
export function projectState(raw: ProjectionInput): ConversationSnapshot {
  const entries: PublicEntry[] = [];
  // Scope identities to the assistant entry: providers may reuse call IDs in later rounds.
  const calls = new Map<string, PublicEntry>();
  for (const entry of raw.entries) {
    const kind = entry.kind === 'pi.user' ? 'user' : entry.kind === 'pi.assistant' ? 'assistant' : entry.kind === 'pi.tool-result' ? 'tool' : undefined;
    if (!kind) continue;
    const content = (entry.model ?? []).map(message => typeof message.content === 'string' ? message.content : message.content.map(part => 'text' in part ? part.text : '').join('')).join('');
    if (kind === 'tool') {
      const message = entry.model?.find(message => message.role === 'toolResult');
      const callId = message?.role === 'toolResult' ? message.toolCallId : undefined;
      const data = entry.data as { diagnostics?: { code?: string }[] } | undefined;
      const uncertain = data?.diagnostics?.some(diagnostic => diagnostic.code === 'interrupted') || undefined;
      let call = callId ? calls.get(callId) : undefined;
      if (!call) {
        // A bounded history window may start after the request that produced this result.
        call = { id: String(entry.id), kind: 'tool', content: '' };
        entries.push(call);
        if (callId) calls.set(callId, call);
      }
      Object.assign(call, {
        content,
        toolName: message?.role === 'toolResult' ? message.toolName : undefined,
        toolStatus: 'done',
        ...(message?.role === 'toolResult' && message.isError ? { toolError: true } : {}),
        ...(uncertain ? { uncertain } : {}),
      });
      continue;
    }
    const timestamp = entry.model?.find(message => 'timestamp' in message)?.timestamp;
    if (content || kind === 'user') entries.push({ id: String(entry.id), kind, content, ...(typeof timestamp === 'number' ? { timestamp } : {}) });
    if (kind === 'assistant') {
      for (const message of entry.model ?? []) {
        if (message.role !== 'assistant') continue;
        for (const part of message.content) {
          if (part.type !== 'toolCall') continue;
          const call: PublicEntry = {
            id: `tool:${entry.id}:${part.id}`,
            kind: 'tool',
            toolName: part.name,
            toolArguments: part.arguments,
            content: '',
            toolStatus: 'pending',
          };
          entries.push(call);
          calls.set(part.id, call);
        }
      }
    }
  }
  const partial = raw.live?.generation?.message;
  if (partial) {
    const content = partial.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('');
    if (content) entries.push({ id: `assistant:${raw.live?.run?.taskId}`, kind: 'assistant', content, partial: true });
  }
  for (const tool of [...(raw.live?.tools ?? []), ...(raw.live?.nestedTools ?? [])]) {
    let call = calls.get(tool.callId);
    if (call?.toolStatus === 'done') continue;
    if (!call) {
      call = { id: `tool:${tool.callId}`, kind: 'tool', toolName: tool.name, content: '', toolStatus: tool.status };
      if ('arguments' in tool) call.toolArguments = tool.arguments;
      entries.push(call);
    }
    call.content = tool.output ?? '';
    call.toolStatus = tool.status;
  }
  const lastUser = entries.findLastIndex(entry => entry.kind === 'user');
  const uncertain = entries.slice(lastUser + 1).some(entry => entry.uncertain);
  let status: ConversationSnapshot['status'] = 'idle';
  if (raw.live?.run) status = raw.abortRequested ? 'cancelling' : 'running';
  else if (raw.live?.runFailure && raw.live.runFailure.reason !== "aborted") status = ["orphaned", "interrupted"].includes(raw.live.runFailure.reason) ? "interrupted" : "failed";
  else if (raw.latest?.status === 'unanswered' && raw.latest.reason !== 'aborted') status = ['orphaned', 'interrupted'].includes(raw.latest.reason) ? 'interrupted' : 'failed';
  else if (uncertain) status = 'interrupted';
  return { id: raw.id, revision: raw.revision, status, entries };
}

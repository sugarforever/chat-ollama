import type { PublicEntry } from './contracts';

export type ConversationTurn = {
  id: string;
  user?: PublicEntry;
  activity: PublicEntry[];
  answer?: PublicEntry;
  active: boolean;
  durationSeconds?: number;
};

export function conversationTurns(entries: PublicEntry[], busy: boolean): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const entry of entries) {
    if (entry.kind === 'user' || !turns.length)
      turns.push({id: `turn:${entry.id}`, ...(entry.kind === 'user' ? {user: entry} : {}), activity: [], active: false});
    if (entry.kind !== 'user') turns.at(-1)!.activity.push(entry);
  }
  for (const [index, turn] of turns.entries()) {
    turn.active = busy && index === turns.length - 1;
    const last = turn.activity.at(-1);
    if (last?.kind === 'assistant') turn.answer = turn.activity.pop();
    if (turn.user?.timestamp !== undefined && turn.answer?.timestamp !== undefined)
      turn.durationSeconds = Math.max(1, Math.round((turn.answer.timestamp - turn.user.timestamp) / 1000));
  }
  return turns;
}

export function activityBlocks(entries: PublicEntry[]) {
  const blocks: {id: string; kind: 'tools' | 'commentary'; entries: PublicEntry[]}[] = [];
  for (const entry of entries) {
    const kind = entry.kind === 'tool' ? 'tools' : 'commentary';
    const previous = blocks.at(-1);
    if (kind === 'tools' && previous?.kind === 'tools') previous.entries.push(entry);
    else blocks.push({id: entry.id, kind, entries: [entry]});
  }
  return blocks;
}

export function toolLabel(entry: PublicEntry) {
  const running = entry.toolStatus === 'running' || entry.toolStatus === 'pending';
  const name = entry.toolName ?? 'tool';
  const input = entry.toolArguments;
  const detail = name === 'bash' ? input?.command : input?.path ?? input?.query;
  const verb = entry.toolError ? 'Failed' : running ? 'Running' : name === 'read' ? 'Read' : name === 'write' ? 'Wrote' : name === 'edit' ? 'Edited' : 'Ran';
  const target = ['bash', 'read', 'write', 'edit'].includes(name) && typeof detail === 'string' ? detail : `${name}${typeof detail === 'string' ? ` · ${detail}` : ''}`;
  return `${verb} ${target}`;
}

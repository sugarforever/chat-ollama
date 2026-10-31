import { expect, test } from 'vitest';
import { snapshotEvents } from '../src/lib/server/events';
import type { ConversationSnapshot } from '../src/lib/contracts';
import type { AgentSession } from '../src/lib/server/runtime/session';
// Catches buffering every missed revision and leaking the watcher after response cancellation.
test('a slow SSE reader retains only the newest pending state and cancels its watcher', async () => {
  let listener!: (state: ConversationSnapshot) => void;
  let detached = false;
  const session = { watch(callback) { listener = callback; return () => { detached = true; }; } } as AgentSession;
  const abort = new AbortController(); const stream = snapshotEvents(session, abort.signal);
  for (let i = 0; i < 10000; i++) listener({ id: 'one', revision: String(i), status: 'running', entries: [] });
  const reader = stream.getReader();
  const value = new TextDecoder().decode((await reader.read()).value);
  expect(JSON.parse(value.slice(6)).snapshot.revision).toBe('9999');
  const next = reader.read(); listener({ id: 'one', revision: '10000', status: 'idle', entries: [] });
  expect(new TextDecoder().decode((await next).value)).toContain('"status":"idle"');
  await reader.cancel(); expect(detached).toBe(true); abort.abort();
});
// Catches leaving a waiting response and watcher alive on request abort.
test('aborting an idle SSE response closes its reader and removes the watcher', async () => {
  let detached = false;
  const session = { watch() { return () => { detached = true; }; } } as unknown as AgentSession;
  const abort = new AbortController(); const reader = snapshotEvents(session, abort.signal).getReader();
  const pending = reader.read(); abort.abort(); expect(await pending).toEqual({ done: true, value: undefined }); expect(detached).toBe(true);
});

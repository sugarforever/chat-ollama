import type { AgentSession } from './runtime/session';
import type { StateEvent } from '../contracts';

export function snapshotEvents(session: AgentSession, signal: AbortSignal) {
  let unsubscribe: (() => void) | undefined;
  let pending: Uint8Array | undefined;
  let waiting = false;
  let closed = false;
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  function flush() {
    if (waiting && pending && !closed) {
      waiting = false;
      const value = pending;
      pending = undefined;
      controller.enqueue(value);
    }
  }
  function cleanup() {
    if (closed) return;
    closed = true;
    pending = undefined;
    unsubscribe?.();
    signal.removeEventListener('abort', abort);
  }
  function abort() {
    cleanup();
    controller.close();
  }

  return new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      unsubscribe = session.watch(snapshot => {
        const event: StateEvent = { type: 'snapshot', snapshot };
        pending = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
        flush();
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    },
    pull() {
      waiting = true;
      flush();
    },
    cancel() { cleanup(); },
  }, { highWaterMark: 0 });
}

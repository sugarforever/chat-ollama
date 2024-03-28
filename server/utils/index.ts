import type { H3Event, EventHandlerRequest } from 'h3'

export const setEventStreamResponse = (event: H3Event<EventHandlerRequest>) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Connection', 'keep-alive');
};

export async function FetchWithAuth(this: { username: string | null, password: string | null }, input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const authorization = btoa(`${this?.username}:${this?.password}`);
  console.log(`Authorization: ${authorization}`);
  headers.set('Authorization', `Basic ${authorization}`);
  return fetch(input, { ...init, headers });
}

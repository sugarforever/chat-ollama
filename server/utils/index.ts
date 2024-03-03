export const setEventStreamResponse = (event) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Connection', 'keep-alive');
};

export const FetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const authorization = btoa(`${this?.username}:${this?.password}`);
  console.log(`Authorization: ${authorization}`);
  headers.set('Authorization', `Basic ${authorization}`);
  return fetch(input, { ...init, headers });
}

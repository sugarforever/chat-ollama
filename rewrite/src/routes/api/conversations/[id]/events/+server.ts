import { api } from '$lib/server/api';
import { snapshotEvents } from '$lib/server/events';
import { startup } from '$lib/server/startup';
export const GET = ({ params, request }: { params: { id: string }; request: Request }) => api(async () => {
  const session = await (await startup()).getSession(params.id);
  return new Response(snapshotEvents(session, request.signal), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
});

import { json } from '@sveltejs/kit';
import { api, body } from '$lib/server/api';
import { ApiError } from '$lib/server/errors';
import { startup } from '$lib/server/startup';
export const POST = ({ params, request }: { params: { id: string }; request: Request }) => api(async () => {
  const session = await (await startup()).getSession(params.id);
  const { requestId, content } = await body(request);
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200 || typeof content !== 'string' || !content.trim() || content.length > 1000000) throw new ApiError(400, 'INVALID_INPUT', 'A request ID and message content are required');
  return json(await session.submit(requestId, content), { status: 202 });
});

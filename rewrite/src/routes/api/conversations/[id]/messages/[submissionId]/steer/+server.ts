import { json } from '@sveltejs/kit';
import { api } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const POST = ({ params }: { params: { id: string; submissionId: string } }) => api(async () => {
  const session = await (await startup()).getSession(params.id);
  await session.steer(params.submissionId);
  return json({ ok: true });
});

import { json } from '@sveltejs/kit';
import { api } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const GET = ({ params, url }: { params: { id: string; artifactId: string }; url: URL }) => api(async () => {
  const artifact = await (await startup()).goals.artifact(params.id, params.artifactId);
  if (url.searchParams.get('download') === '1') return new Response(artifact.content, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="goal-result.md"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  return json(artifact);
});

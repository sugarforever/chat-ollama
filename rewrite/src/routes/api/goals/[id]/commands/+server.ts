import { json } from '@sveltejs/kit';
import { api, body } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const POST = ({ params, request }: { params: { id: string }; request: Request }) => api(async () => json(await (await startup()).goals.control(params.id, await body(request))));

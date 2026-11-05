import { json } from '@sveltejs/kit';
import { api } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const GET = ({ params }: { params: { id: string } }) => api(async () => json(await (await (await startup()).getSession(params.id)).snapshot()));

import { json } from '@sveltejs/kit';
import { api, body } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const GET = () => api(async () => json(await (await startup()).goals.list()));
export const POST = ({ request }: { request: Request }) => api(async () => json(await (await startup()).goals.create(await body(request)), { status: 201 }));

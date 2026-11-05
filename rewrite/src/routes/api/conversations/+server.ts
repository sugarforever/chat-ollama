import { json } from '@sveltejs/kit';
import { api, body, config } from '$lib/server/api';
import { startup } from '$lib/server/startup';
export const GET = () => api(async () => json(await (await startup()).listConversations()));
export const POST = ({ request }: { request: Request }) => api(async () => json(await (await startup()).createConversation(config(await body(request))), { status: 201 }));

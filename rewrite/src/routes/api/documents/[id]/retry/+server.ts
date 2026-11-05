import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
export const POST = ({ params }: { params: { id: string } }) =>
  api(() => json(knowledge().retryDocument(params.id), { status: 202 }));

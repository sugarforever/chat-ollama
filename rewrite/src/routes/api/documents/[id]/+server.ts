import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
export const GET = ({ params }: { params: { id: string } }) =>
  api(() => json(knowledge().document(params.id)));
export const DELETE = ({ params }: { params: { id: string } }) =>
  api(async () => {
    await knowledge().deleteDocument(params.id);
    return new Response(null, { status: 204 });
  });

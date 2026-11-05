import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
export const DELETE = ({ params }: { params: { id: string } }) =>
  api(async () => {
    await knowledge().deleteCollection(params.id);
    return new Response(null, { status: 204 });
  });

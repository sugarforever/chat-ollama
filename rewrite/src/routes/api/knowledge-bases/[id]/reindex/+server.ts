import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
export const POST = ({ params }: { params: { id: string } }) =>
  api(() => {
    knowledge().reindex(params.id);
    return json({ queued: true }, { status: 202 });
  });

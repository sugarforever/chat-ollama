import { api } from "$lib/server/api";
import { skillStore } from "$lib/server/skills/store";
export const DELETE = ({ params }: { params: { id: string } }) =>
  api(() => {
    skillStore().remove(params.id);
    return new Response(null, { status: 204 });
  });

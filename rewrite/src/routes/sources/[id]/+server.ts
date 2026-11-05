import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
// JSON excerpts are deliberately inert. Task 6 can render a source panel.
export const GET = ({ params }: { params: { id: string } }) =>
  api(() => json(knowledge().source(params.id)));

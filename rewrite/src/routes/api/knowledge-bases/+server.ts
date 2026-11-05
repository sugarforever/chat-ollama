import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
export const GET = () => api(() => json(knowledge().collections()));
export const POST = ({ request }: { request: Request }) =>
  api(async () =>
    json(knowledge().createCollection((await body(request)).name), {
      status: 201,
    }),
  );

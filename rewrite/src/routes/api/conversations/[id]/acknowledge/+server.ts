import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { startup } from "$lib/server/startup";
export const POST = ({ params }: { params: { id: string } }) =>
  api(async () => {
    const session = await (await startup()).getSession(params.id);
    await session.acknowledgeInterruption();
    return json(await session.snapshot());
  });

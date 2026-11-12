import { json } from "@sveltejs/kit";
import { api, body, selection } from "$lib/server/api";
import { startup } from "$lib/server/startup";
export const GET = ({ params }: { params: { id: string } }) =>
  api(async () =>
    json(await (await (await startup()).getSession(params.id)).snapshot()),
  );

export const PATCH = ({
  params,
  request,
}: {
  params: { id: string };
  request: Request;
}) =>
  api(async () =>
    json(
      await (
        await startup()
      ).selectModel(params.id, selection(await body(request))),
    ),
  );

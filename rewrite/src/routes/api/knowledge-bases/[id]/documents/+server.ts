import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
import { uploadFile } from "$lib/server/knowledge/http";
export const GET = ({ params }: { params: { id: string } }) =>
  api(() => json(knowledge().documents(params.id)));
export const POST = ({
  params,
  request,
}: {
  params: { id: string };
  request: Request;
}) =>
  api(async () => {
    const file = await uploadFile(request);
    return json(await knowledge().upload(params.id, file.name, file.bytes), {
      status: 202,
    });
  });

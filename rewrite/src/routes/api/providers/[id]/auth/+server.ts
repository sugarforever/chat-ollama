import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { ApiError } from "$lib/server/errors";
import {
  authStatus,
  startLogin,
  answerLogin,
  cancelLogin,
  disconnectProvider,
} from "$lib/server/provider-auth";
export const GET = ({ params }: { params: { id: string } }) =>
  api(() =>
    json(authStatus(params.id), { headers: { "cache-control": "no-store" } }),
  );
export const POST = ({
  params,
  request,
}: {
  params: { id: string };
  request: Request;
}) =>
  api(async () => {
    const b = await body(request);
    const id = params.id;
    if (b.action === "start" && (b.type === "oauth" || b.type === "api_key"))
      return json(startLogin(id, b.type));
    if (
      b.action === "answer" &&
      typeof b.flowId === "string" &&
      typeof b.promptId === "string" &&
      typeof b.value === "string"
    )
      return json(answerLogin(id, b.flowId, b.promptId, b.value));
    if (b.action === "cancel") return json(cancelLogin(id));
    if (b.action === "disconnect") return json(await disconnectProvider(id));
    throw new ApiError(400, "INVALID_INPUT", "Invalid auth command");
  });

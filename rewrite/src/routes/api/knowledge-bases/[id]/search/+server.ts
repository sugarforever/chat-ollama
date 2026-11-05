import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
import { ApiError } from "$lib/server/errors";
export const POST = ({
  params,
  request,
}: {
  params: { id: string };
  request: Request;
}) =>
  api(async () => {
    const value = await body(request);
    if (
      typeof value.query !== "string" ||
      (value.limit !== undefined && typeof value.limit !== "number")
    )
      throw new ApiError(400, "INVALID_INPUT", "Invalid query");
    return json(
      await knowledge().searchKnowledgeBases(
        [params.id],
        value.query,
        value.limit as number | undefined,
      ),
    );
  });

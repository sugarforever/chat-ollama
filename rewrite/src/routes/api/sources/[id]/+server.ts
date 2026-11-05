import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { knowledge } from "$lib/server/knowledge";
import { startup } from "$lib/server/startup";
import { ApiError } from "$lib/server/errors";
export const GET = ({ params, url }: { params: { id: string }; url: URL }) =>
  api(async () => {
    const conversations = await (await startup()).listConversations();
    const conversation = conversations.find(
      (c) => c.id === url.searchParams.get("conversationId"),
    );
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Source not found");
    const source = knowledge().source(params.id);
    if (!conversation.config.knowledgeBaseIds.includes(source.collectionId))
      throw new ApiError(404, "NOT_FOUND", "Source not found");
    return json(source);
  });

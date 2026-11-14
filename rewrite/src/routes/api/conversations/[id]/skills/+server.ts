import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { startup } from "$lib/server/startup";
import { skillStore } from "$lib/server/skills/store";

type Event = { params: { id: string }; request: Request };
export const GET = ({ params }: Pick<Event, "params">) => api(async () => {
  const excludedSkillIds = await (await startup()).getSkillExclusions(params.id);
  return json({ installed: skillStore().list(), excludedSkillIds });
});
export const PATCH = ({ params, request }: Event) => api(async () => {
  const value = await body(request);
  const excludedSkillIds = await (await startup()).setSkillExclusions(params.id, value.excludedSkillIds);
  return json({ installed: skillStore().list(), excludedSkillIds });
});

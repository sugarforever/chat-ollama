import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { skillStore, skillError } from "$lib/server/skills/store";
import { githubSkillFiles } from "$lib/server/skills/github";
import { skillRequest, uploadedSkills } from "$lib/server/skills/http";
export const POST = ({ request }: { request: Request }) =>
  api(async () => {
    request = await skillRequest(request);
    if (request.headers.get("content-type")?.startsWith("multipart/form-data"))
      return json(
        await skillStore().discover(
          await uploadedSkills(request),
          "Local folder",
        ),
      );
    const value = await body(request);
    if (typeof value.url !== "string") skillError("SKILL_URL");
    const result = await githubSkillFiles(value.url);
    return json(await skillStore().discover(result.files, result.source));
  });

import { json } from "@sveltejs/kit";
import { api, body } from "$lib/server/api";
import { skillCatalog } from "$lib/skills";
import { skillStore, skillError } from "$lib/server/skills/store";
import { githubSkillFiles } from "$lib/server/skills/github";
import { skillRequest } from "$lib/server/skills/http";
export const POST = ({ request }: { request: Request }) =>
  api(async () => {
    const value = await body(await skillRequest(request));
    const store = skillStore();
    if (value.catalogId !== undefined) {
      const entry = skillCatalog.find((s) => s.id === value.catalogId);
      if (!entry) skillError();
      const resource = await githubSkillFiles(entry.url);
      const discovered = await store.discover(resource.files, resource.source);
      return json(
        await store.install(
          discovered.importId,
          discovered.skills.map((s) => s.path),
        ),
        { status: 201 },
      );
    }
    if (
      typeof value.importId !== "string" ||
      !Array.isArray(value.paths) ||
      !value.paths.every((p) => typeof p === "string")
    )
      skillError();
    return json(await store.install(value.importId, value.paths), {
      status: 201,
    });
  });

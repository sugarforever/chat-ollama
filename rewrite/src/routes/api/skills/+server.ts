import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { skillCatalog } from "$lib/skills";
import { skillStore } from "$lib/server/skills/store";
export const GET = () =>
  api(() => json({ installed: skillStore().list(), catalog: skillCatalog }));

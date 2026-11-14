import { skillLimits, type SkillFile } from "../../skills";
import { limitedBytes } from "./github";
import { skillError } from "./store";
// Bound multipart overhead as well as payload before asking the platform to parse it.
export async function skillRequest(request: Request): Promise<Request> {
  const max = skillLimits.totalBytes + 2 * 1024 * 1024;
  const bytes = await limitedBytes(
    new Response(request.body, { headers: request.headers }),
    max,
  );
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bytes as BodyInit,
  });
}
export async function uploadedSkills(request: Request): Promise<SkillFile[]> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    skillError();
  }
  const files = form!.getAll("files"),
    paths = form!.getAll("paths");
  if (
    !files.length ||
    files.length > skillLimits.files ||
    paths.length !== files.length
  )
    skillError("SKILL_LIMIT");
  const result: SkillFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i],
      path = paths[i];
    if (!(file instanceof File) || typeof path !== "string") skillError();
    if (file.size > skillLimits.fileBytes) skillError("SKILL_LIMIT");
    result.push({ path, content: new Uint8Array(await file.arrayBuffer()) });
  }
  return result;
}

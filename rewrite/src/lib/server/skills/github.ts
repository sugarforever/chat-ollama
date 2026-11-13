import { skillLimits, type SkillFile } from "../../skills";
import { ApiError } from "../errors";
import { skillError, validateSkillPath } from "./store";

export async function limitedBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    skillError("SKILL_LIMIT");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) skillError("SKILL_LIMIT");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function githubSkillFiles(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<{ files: SkillFile[]; source: string }> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    skillError("SKILL_URL");
  }
  if (
    typeof input !== "string" ||
    input.length > 2000 ||
    url!.protocol !== "https:" ||
    url!.hostname !== "github.com" ||
    url!.port ||
    url!.username ||
    url!.password ||
    url!.search ||
    url!.hash ||
    /(?:^|\/)\.\.?([/]|$)|\\/.test(input)
  )
    skillError("SKILL_URL");
  let parts: string[];
  try {
    parts = url!.pathname
      .replace(/\/$/, "")
      .split("/")
      .slice(1)
      .map(decodeURIComponent);
  } catch {
    skillError("SKILL_URL");
  }
  const [owner, rawRepo, kind, ...tail] = parts!;
  const repo = rawRepo?.replace(/\.git$/, "");
  if (
    !/^[\w-]+$/.test(owner || "") ||
    !/^[\w.-]+$/.test(repo || "") ||
    (kind && (kind !== "tree" || !tail.length)) ||
    tail.length > 20
  )
    skillError("SKILL_URL");
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const signal = AbortSignal.timeout(60000);
  async function response(url: string) {
    const result = await fetcher(url, {
      redirect: "error",
      signal,
      headers: {
        "User-Agent": "ChatOllama",
        Accept: "application/vnd.github+json",
      },
    });
    return result;
  }
  async function json(url: string, allowMissing = false): Promise<any> {
    const result = await response(url);
    if (allowMissing && [404, 422].includes(result.status)) {
      await result.body?.cancel();
      return undefined;
    }
    if (!result.ok) {
      await result.body?.cancel();
      skillError("SKILL_REPOSITORY");
    }
    return JSON.parse(
      new TextDecoder().decode(await limitedBytes(result, 8 * 1024 * 1024)),
    );
  }
  try {
    let commit: any,
      folder = "";
    if (!kind) {
      const repository = await json(api);
      commit = await json(
        `${api}/commits/${encodeURIComponent(repository.default_branch)}`,
      );
    } else {
      // Longest matching ref supports branch names containing slashes.
      for (let count = tail.length; count > 0; count--) {
        commit = await json(
          `${api}/commits/${encodeURIComponent(tail.slice(0, count).join("/"))}`,
          true,
        );
        if (commit) {
          folder = tail.slice(count).join("/");
          break;
        }
      }
    }
    if (!commit || !/^[a-f0-9]{40}$/.test(commit.sha))
      skillError("SKILL_REPOSITORY");
    if (folder) validateSkillPath(folder);
    const tree = await json(`${api}/git/trees/${commit.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 30000)
      skillError("SKILL_LIMIT");
    type Entry = { path: string; mode: string; type: string; size?: number };
    const entries = (tree.tree as Entry[]).filter(
      (e) => !folder || e.path.startsWith(folder + "/"),
    );
    const roots = entries
      .filter((e) => e.path.split("/").at(-1) === "SKILL.md")
      .map((e) => (e.path === "SKILL.md" ? "" : e.path.slice(0, -9)));
    if (!roots.length) skillError();
    if (roots.length > skillLimits.skills) skillError("SKILL_LIMIT");
    const payload = entries.filter(
      (e) =>
        e.type !== "tree" &&
        roots.some((root) => !root || e.path.startsWith(root + "/")),
    );
    if (payload.length > skillLimits.files) skillError("SKILL_LIMIT");
    let declared = 0;
    for (const e of payload) {
      validateSkillPath(e.path);
      if (e.type !== "blob" || !["100644", "100755"].includes(e.mode))
        skillError();
      if (
        typeof e.size !== "number" ||
        e.size < 0 ||
        e.size > skillLimits.fileBytes
      )
        skillError("SKILL_LIMIT");
      declared += e.size;
    }
    if (declared > skillLimits.totalBytes) skillError("SKILL_LIMIT");
    const files: SkillFile[] = new Array(payload.length);
    let cursor = 0,
      total = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, payload.length) }, async () => {
        while (cursor < payload.length) {
          const index = cursor++,
            entry = payload[index];
          const result = await response(
            `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`,
          );
          if (!result.ok) {
            await result.body?.cancel();
            skillError("SKILL_REPOSITORY");
          }
          const content = await limitedBytes(result, skillLimits.fileBytes);
          total += content.byteLength;
          if (total > skillLimits.totalBytes) skillError("SKILL_LIMIT");
          files[index] = { path: entry.path, content };
        }
      }),
    );
    return {
      files,
      source: `https://github.com/${owner}/${repo}/tree/${commit.sha}${folder ? "/" + folder : ""}`,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    skillError("SKILL_REPOSITORY");
  }
}

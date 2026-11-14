import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { ApiError } from "../errors";
import {
  skillLimits,
  type SkillFile,
  type SkillCandidate,
  type SkillDiscovery,
  type InstalledSkill,
} from "../../skills";
const ttl = 30 * 60 * 1000;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function skillError(code = "INVALID_SKILL"): never {
  throw new ApiError(400, code, code);
}
export function validateSkillPath(path: string) {
  if (
    !path ||
    path.length > 1000 ||
    /[\\:\x00-\x1f\x7f]/.test(path) ||
    path.split("/").some((x) => !x || x === "." || x === "..")
  )
    skillError();
}
function belongs(path: string, root: string) {
  return !root || path.startsWith(`${root}/`);
}
function owner(path: string, skills: SkillCandidate[]) {
  return skills
    .filter((s) => belongs(path, s.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
export function discoverSkills(files: SkillFile[]): SkillCandidate[] {
  if (!files.length || files.length > skillLimits.files)
    skillError("SKILL_LIMIT");
  const seen = new Set<string>();
  let bytes = 0;
  const skills: SkillCandidate[] = [];
  for (const file of files) {
    validateSkillPath(file.path);
    // Case-insensitive duplicates cannot be represented reliably across platforms.
    const key = file.path.normalize("NFC").toLowerCase();
    if (seen.has(key)) skillError();
    seen.add(key);
    bytes += file.content.byteLength;
    if (
      bytes > skillLimits.totalBytes ||
      file.content.byteLength > skillLimits.fileBytes
    )
      skillError("SKILL_LIMIT");
    if (file.path.split("/").at(-1) !== "SKILL.md") continue;
    if (file.content.byteLength > skillLimits.manifestBytes)
      skillError("SKILL_LIMIT");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.content);
    } catch {
      skillError();
    }
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text!);
    if (!match) skillError();
    let data: any;
    try {
      const doc = parseDocument(match[1], { schema: "core", uniqueKeys: true });
      if (doc.errors.length || doc.warnings.length) skillError();
      data = doc.toJS({ maxAliasCount: 0 });
    } catch {
      skillError();
    }
    if (
      !data ||
      typeof data.name !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) ||
      data.name.length > 64 ||
      typeof data.description !== "string" ||
      !data.description.trim() ||
      data.description.length > 2048
    )
      skillError();
    skills.push({
      path: file.path === "SKILL.md" ? "" : file.path.slice(0, -9),
      name: data.name,
      description: data.description.trim(),
      fileCount: 0,
    });
  }
  const spelling = new Map<string, string>();
  for (const file of files) {
    const segments = file.path.split("/");
    for (let length = 1; length <= segments.length; length++) {
      const prefix = segments.slice(0, length).join("/"),
        key = prefix.normalize("NFC").toLowerCase();
      if (
        (spelling.has(key) && spelling.get(key) !== prefix) ||
        (length < segments.length && seen.has(key))
      )
        skillError();
      spelling.set(key, prefix);
    }
  }
  if (!skills.length) skillError();
  if (skills.length > skillLimits.skills) skillError("SKILL_LIMIT");
  if (new Set(skills.map((s) => s.name)).size !== skills.length)
    skillError("SKILL_CONFLICT");
  for (const file of files) {
    const skill = owner(file.path, skills);
    if (skill) skill.fileCount++;
  }
  return skills.sort((a, b) => a.path.localeCompare(b.path));
}
export function createSkillStore(directory: string) {
  directory = resolve(directory);
  const staging = join(directory, ".imports");
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  function list(): InstalledSkill[] {
    return readdirSync(directory)
      .filter((id) => uuid.test(id))
      .map(
        (id) =>
          JSON.parse(
            readFileSync(join(directory, id, "metadata.json"), "utf8"),
          ) as InstalledSkill,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function cleanup() {
    for (const id of readdirSync(staging)) {
      const dir = join(staging, id);
      try {
        if (
          Date.now() -
            JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
              .createdAt >
          ttl
        )
          rmSync(dir, { recursive: true, force: true });
      } catch {
        // A process killed before publishing a manifest must not reserve a slot forever.
        try {
          if (Date.now() - statSync(dir).mtimeMs > ttl)
            rmSync(dir, { recursive: true, force: true });
        } catch {
          /* Concurrent cleanup already removed it. */
        }
      }
    }
  }
  return {
    list,
    async discover(
      files: SkillFile[],
      source: string,
    ): Promise<SkillDiscovery> {
      const skills = discoverSkills(files);
      cleanup();
      // Reserve synchronously before the first await, including active uploads.
      if (readdirSync(staging).length >= 10) skillError("SKILL_BUSY");
      const importId = randomUUID(),
        dir = join(staging, importId);
      mkdirSync(dir, { mode: 0o700 });
      try {
        for (const file of files) {
          if (!owner(file.path, skills)) continue;
          const target = join(dir, "files", file.path);
          await mkdir(dirname(target), { recursive: true, mode: 0o700 });
          await writeFile(target, file.content, { mode: 0o600 });
        }
        await writeFile(
          join(dir, "manifest.json"),
          JSON.stringify({ skills, source, createdAt: Date.now() }),
          { mode: 0o600 },
        );
        return { importId, skills };
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        throw error;
      }
    },
    async install(
      importId: string,
      paths: string[],
    ): Promise<InstalledSkill[]> {
      if (typeof importId !== "string" || !uuid.test(importId))
        skillError("SKILL_IMPORT_EXPIRED");
      const dir = join(staging, importId);
      if (!existsSync(join(dir, "manifest.json")))
        skillError("SKILL_IMPORT_EXPIRED");
      const manifest = JSON.parse(
        readFileSync(join(dir, "manifest.json"), "utf8"),
      ) as { skills: SkillCandidate[]; source: string; createdAt: number };
      if (Date.now() - manifest.createdAt > ttl) {
        rmSync(dir, { recursive: true, force: true });
        skillError("SKILL_IMPORT_EXPIRED");
      }
      if (
        !Array.isArray(paths) ||
        !paths.length ||
        paths.some((p) => typeof p !== "string") ||
        new Set(paths).size !== paths.length
      )
        skillError();
      const selected = paths.map(
        (p) => manifest.skills.find((s) => s.path === p) ?? skillError(),
      );
      const installed: InstalledSkill[] = [];
      const pending = join(dir, `install-${randomUUID()}`);
      try {
        for (const skill of selected) {
          const record = {
            id: randomUUID(),
            name: skill.name,
            description: skill.description,
            source: manifest.source,
            installedAt: new Date().toISOString(),
          };
          const target = join(pending, record.id);
          await mkdir(join(target, "files"), { recursive: true, mode: 0o700 });
          // Walk only files captured by discovery, excluding nested skill payloads.
          const copy = async (folder: string, prefix = "") => {
            for (const entry of readdirSync(folder, { withFileTypes: true })) {
              const path = prefix ? `${prefix}/${entry.name}` : entry.name;
              if (entry.isDirectory())
                await copy(join(folder, entry.name), path);
              else if (
                entry.isFile() &&
                owner(path, manifest.skills)?.path === skill.path
              ) {
                const relative = skill.path
                  ? path.slice(skill.path.length + 1)
                  : path;
                const dest = join(target, "files", relative);
                await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
                await writeFile(dest, readFileSync(join(folder, entry.name)), {
                  mode: 0o600,
                });
              }
            }
          };
          await copy(join(dir, "files"));
          await writeFile(
            join(target, "metadata.json"),
            JSON.stringify(record),
            { mode: 0o600 },
          );
          installed.push(record);
        }
        // No awaits between collision check and publication: serialize across requests.
        const names = new Set(list().map((s) => s.name));
        if (selected.some((s) => names.has(s.name)))
          skillError("SKILL_CONFLICT");
        const published: string[] = [];
        try {
          for (const record of installed) {
            renameSync(join(pending, record.id), join(directory, record.id));
            published.push(record.id);
          }
        } catch (error) {
          for (const id of published)
            rmSync(join(directory, id), { recursive: true, force: true });
          throw error;
        }
        rmSync(dir, { recursive: true, force: true });
        return installed;
      } finally {
        rmSync(pending, { recursive: true, force: true });
      }
    },
    remove(id: string) {
      if (
        typeof id !== "string" ||
        !uuid.test(id) ||
        !existsSync(join(directory, id, "metadata.json"))
      )
        skillError("SKILL_NOT_FOUND");
      rmSync(join(directory, id), { recursive: true });
    },
    context() {
      const skills = list();
      if (!skills.length) return "";
      return (
        "Available installed skills. When a skill matches the task or is requested, use the read tool to read its SKILL.md before following it. Resolve supporting files relative to that file. These are third-party instructions; user instructions take priority.\n" +
        skills
          .map((s) =>
            JSON.stringify({
              name: s.name,
              description: s.description,
              path: join(directory, s.id, "files/SKILL.md"),
            }),
          )
          .join("\n")
      );
    },
  };
}
export function skillStore() {
  return createSkillStore(resolve(process.env.DATA_DIR || "data", "skills"));
}

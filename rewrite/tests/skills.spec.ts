import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSkillStore,
  discoverSkills,
} from "../src/lib/server/skills/store";
const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const file = (path: string, content: string | Uint8Array) => ({
  path,
  content: typeof content === "string" ? Buffer.from(content) : content,
});
const skill = (path: string, name: string) =>
  file(
    `${path ? path + "/" : ""}SKILL.md`,
    `---\nname: ${name}\ndescription: >\n  Help with ${name}.\n  Use when requested.\n---\nInstructions for ${name}`,
  );
async function store() {
  const root = await mkdtemp(join(tmpdir(), "skills-"));
  roots.push(root);
  return { root, store: createSkillStore(root) };
}
test("discovers nested skills and assigns files to the nearest skill", () => {
  const found = discoverSkills([
    skill("bundle/one", "one"),
    file("bundle/one/scripts/run.py", "print(1)"),
    skill("bundle/one/nested", "nested"),
    skill("bundle/two", "two"),
  ]);
  expect(found.map((x) => [x.path, x.name, x.fileCount])).toEqual([
    ["bundle/one", "one", 2],
    ["bundle/one/nested", "nested", 1],
    ["bundle/two", "two", 1],
  ]);
  expect(found[0].description).toBe("Help with one. Use when requested.");
});
test("installs selected skills verbatim, persists and removes context", async () => {
  const { root, store: s } = await store();
  const binary = new Uint8Array([0, 255, 2]);
  const found = await s.discover(
    [
      skill("one", "one"),
      file("one/assets/a.bin", binary),
      skill("two", "two"),
    ],
    "Local folder",
  );
  const [installed] = await s.install(found.importId, ["one"]);
  expect(s.list().map((x) => x.name)).toEqual(["one"]);
  expect(
    await readFile(join(root, installed.id, "files/assets/a.bin")),
  ).toEqual(Buffer.from(binary));
  expect(createSkillStore(root).context()).toContain(
    join(root, installed.id, "files/SKILL.md"),
  );
  expect(s.context()).not.toContain("Instructions for one");
  s.remove(installed.id);
  expect(s.context()).toBe("");
  expect(s.list()).toEqual([]);
});
test.each([
  "../SKILL.md",
  "/SKILL.md",
  "C:/SKILL.md",
  "a\\SKILL.md",
  "a/../SKILL.md",
  "a//SKILL.md",
  "a/\u0000SKILL.md",
])("rejects unsafe path %s", (path) => {
  expect(() => discoverSkills([file(path, "bad")])).toThrow();
});
test("rejects duplicate paths, invalid metadata, absent skills and limits", () => {
  expect(() => discoverSkills([skill("", "one"), skill("", "two")])).toThrow();
  expect(() =>
    discoverSkills([file("SKILL.md", "---\nname: bad\n---\ntext")]),
  ).toThrow();
  expect(() => discoverSkills([file("README.md", "hello")])).toThrow();
  expect(() =>
    discoverSkills([
      skill("", "one"),
      file("large", new Uint8Array(5 * 1024 * 1024 + 1)),
    ]),
  ).toThrow();
  expect(() =>
    discoverSkills([file("SKILL.md", "x".repeat(128 * 1024 + 1))]),
  ).toThrow();
  expect(() =>
    discoverSkills(Array.from({ length: 1001 }, (_, i) => file(`${i}`, "x"))),
  ).toThrow();
  expect(() =>
    discoverSkills(
      Array.from({ length: 101 }, (_, i) => skill(`${i}`, `skill-${i}`)),
    ),
  ).toThrow();
});
test("rejects collisions and invalid selections without partial installation", async () => {
  const { store: s } = await store();
  const a = await s.discover(
    [skill("one", "one"), skill("two", "two")],
    "Local folder",
  );
  await expect(s.install(a.importId, ["one", "one"])).rejects.toThrow();
  await expect(s.install(a.importId, ["unknown"])).rejects.toThrow();
  await s.install(a.importId, ["one"]);
  const b = await s.discover(
    [skill("one", "one"), skill("two", "two")],
    "Local folder",
  );
  await expect(s.install(b.importId, ["one", "two"])).rejects.toThrow();
  expect(s.list().map((x) => x.name)).toEqual(["one"]);
  await expect(s.install("bad", ["one"])).rejects.toThrow();
});
test("only one competing install of the same name succeeds", async () => {
  const { store: s } = await store();
  const a = await s.discover([skill("", "one")], "Local folder");
  const b = await s.discover([skill("", "one")], "Local folder");
  const results = await Promise.allSettled([
    s.install(a.importId, [""]),
    s.install(b.importId, [""]),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(s.list()).toHaveLength(1);
});

test("expired previews release capacity and cannot be installed", async () => {
  const { store: s } = await store();
  vi.useFakeTimers();
  const first = await s.discover([skill("", "one")], "Local folder");
  for (let i = 0; i < 9; i++)
    await s.discover([skill("", `skill-${i}`)], "Local folder");
  await expect(
    s.discover([skill("", "extra")], "Local folder"),
  ).rejects.toThrow();
  vi.setSystemTime(Date.now() + 31 * 60 * 1000);
  await expect(s.install(first.importId, [""])).rejects.toThrow();
  const next = await s.discover([skill("", "new")], "Local folder");
  await s.install(next.importId, [""]);
  expect(s.list()[0].name).toBe("new");
});
test("rejects conflicting directory/file paths and case collisions", () => {
  expect(() =>
    discoverSkills([
      skill("one", "one"),
      file("one/assets", "x"),
      file("one/assets/note.txt", "y"),
    ]),
  ).toThrow();
  expect(() =>
    discoverSkills([skill("One", "one"), file("one/references/note.txt", "y")]),
  ).toThrow();
});
test("rejects aggregate upload limits, malformed YAML and duplicate skill names", () => {
  expect(() =>
    discoverSkills([
      skill("", "one"),
      ...Array.from({ length: 5 }, (_, i) =>
        file(`asset-${i}`, new Uint8Array(5 * 1024 * 1024)),
      ),
    ]),
  ).toThrow();
  expect(() =>
    discoverSkills([skill("one", "one"), skill("two", "one")]),
  ).toThrow();
  for (const yaml of [
    "name: one\nname: two\ndescription: test",
    "name: one\ndescription: !!js/function test",
    "name: Uppercase\ndescription: test",
    "name: one\ndescription: [not, text]",
  ])
    expect(() =>
      discoverSkills([file("SKILL.md", `---\n${yaml}\n---\ntext`)]),
    ).toThrow();
});

test("rejects Unicode-equivalent filenames before APFS can overwrite supporting content", () => {
  expect(() =>
    discoverSkills([
      skill("", "one"),
      file("é.txt", "composed"),
      file("e\u0301.txt", "decomposed"),
    ]),
  ).toThrow();
  expect(() =>
    discoverSkills([
      skill("café", "one"),
      file("cafe\u0301/note.txt", "different spelling"),
    ]),
  ).toThrow();
});

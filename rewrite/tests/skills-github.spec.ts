import { expect, test } from "vitest";
import { githubSkillFiles } from "../src/lib/server/skills/github";
const sha = "a".repeat(40);
const metadata = "---\nname: one\ndescription: Help with one\n---\nDo it";
function fixture(
  options: {
    truncated?: boolean;
    mode?: string;
    status?: number;
    missingStatus?: number;
  } = {},
) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/acme/skills")
      return Response.json({ default_branch: "main" });
    if (
      url === "https://api.github.com/repos/acme/skills/commits/main" ||
      url ===
        "https://api.github.com/repos/acme/skills/commits/feature%2Fskills"
    )
      return Response.json({ sha });
    if (url.includes("/commits/"))
      return new Response("", { status: options.missingStatus || 404 });
    if (
      url ===
      `https://api.github.com/repos/acme/skills/git/trees/${sha}?recursive=1`
    )
      return options.status
        ? new Response("", { status: options.status })
        : Response.json({
            sha,
            truncated: !!options.truncated,
            tree: [
              {
                path: "skills/one/SKILL.md",
                mode: "100644",
                type: "blob",
                size: metadata.length,
                sha: "1",
              },
              {
                path: "skills/one/scripts/a.py",
                mode: options.mode || "100644",
                type: "blob",
                size: 8,
                sha: "2",
              },
              {
                path: "skills/two/SKILL.md",
                mode: "100644",
                type: "blob",
                size: metadata.length,
                sha: "3",
              },
              {
                path: "README.md",
                mode: "100644",
                type: "blob",
                size: 100,
                sha: "4",
              },
            ],
          });
    if (
      url ===
        `https://raw.githubusercontent.com/acme/skills/${sha}/skills/one/SKILL.md` ||
      url ===
        `https://raw.githubusercontent.com/acme/skills/${sha}/skills/two/SKILL.md`
    )
      return new Response(metadata);
    if (
      url ===
      `https://raw.githubusercontent.com/acme/skills/${sha}/skills/one/scripts/a.py`
    )
      return new Response("print(1)");
    throw Error(`Unexpected network request ${url}`);
  }) as typeof fetch;
}
test("fetches all skill payloads from a repository at a fixed commit", async () => {
  const result = await githubSkillFiles(
    "https://github.com/acme/skills",
    fixture(),
  );
  expect(result.files.map((x) => x.path).sort()).toEqual([
    "skills/one/SKILL.md",
    "skills/one/scripts/a.py",
    "skills/two/SKILL.md",
  ]);
  expect(new TextDecoder().decode(result.files[0].content)).toContain(
    "name: one",
  );
  expect(result.source).toContain(sha);
});
test.each(["main", "feature%2Fskills", "feature/skills"])(
  "resolves folder and branch %s",
  async (ref) => {
    const result = await githubSkillFiles(
      `https://github.com/acme/skills/tree/${ref}/skills/one`,
      fixture(),
    );
    expect(result.files.map((x) => x.path).sort()).toEqual([
      "skills/one/SKILL.md",
      "skills/one/scripts/a.py",
    ]);
  },
);
test.each([
  "http://github.com/acme/skills",
  "https://user:pass@github.com/acme/skills",
  "https://example.org/acme/skills",
  "file:///tmp/skills",
  "https://github.com/acme/skills?token=secret",
  "https://github.com/acme/skills/tree/main/../bad",
])("rejects invalid repository URL %s", async (url) => {
  await expect(githubSkillFiles(url, fixture())).rejects.toThrow();
});
test("rejects truncated trees, unsafe file modes and upstream failures", async () => {
  for (const options of [
    { truncated: true },
    { mode: "120000" },
    { mode: "160000" },
    { status: 403 },
    { status: 404 },
  ])
    await expect(
      githubSkillFiles("https://github.com/acme/skills", fixture(options)),
    ).rejects.toThrow();
});

test("GitHub 422 for a nonmatching ref continues resolving a folder URL", async () => {
  const result = await githubSkillFiles(
    "https://github.com/acme/skills/tree/main/skills/one",
    fixture({ missingStatus: 422 }),
  );
  expect(result.files.map((x) => x.path)).toEqual([
    "skills/one/SKILL.md",
    "skills/one/scripts/a.py",
  ]);
});

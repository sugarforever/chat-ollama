import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GET } from "../src/routes/api/skills/+server";
import { POST as discover } from "../src/routes/api/skills/discover/+server";
import { POST as install } from "../src/routes/api/skills/install/+server";
import { DELETE as remove } from "../src/routes/api/skills/[id]/+server";
import { handle } from "../src/hooks.server";
let root: string;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});
const request = (data: object) => ({
  request: new Request("http://localhost/api/skills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  }),
});
test("multipart discovery supports browser-relative paths, selection, duplicate errors and removal", async () => {
  root = await mkdtemp(join(tmpdir(), "skill-http-"));
  vi.stubEnv("DATA_DIR", root);
  const form = new FormData();
  for (const name of ["one", "two"]) {
    form.append(
      "files",
      new File(
        [`---\nname: ${name}\ndescription: Do ${name}\n---\nInstructions`],
        "SKILL.md",
      ),
    );
    form.append("paths", `bundle/${name}/SKILL.md`);
  }
  const response = await discover({
    request: new Request("http://localhost/api/skills/discover", {
      method: "POST",
      body: form,
    }),
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.skills).toHaveLength(2);
  const saved = await install(
    request({ importId: result.importId, paths: ["bundle/one"] }),
  );
  expect(saved.status).toBe(201);
  const [skill] = await saved.json();
  const list = await (await GET()).json();
  expect(list.installed.map((x: any) => x.name)).toEqual(["one"]);
  expect(list.catalog.length).toBeGreaterThanOrEqual(8);
  expect((await remove({ params: { id: skill.id } })).status).toBe(204);
  expect((await remove({ params: { id: skill.id } })).status).toBe(404);
  expect((await install(request({ catalogId: "unknown" }))).status).toBe(400);
  expect(
    (await install(request({ importId: "bad", paths: ["one"] }))).status,
  ).toBe(410);
});
test("malformed multipart and unsafe paths are public errors", async () => {
  root = await mkdtemp(join(tmpdir(), "skill-http-"));
  vi.stubEnv("DATA_DIR", root);
  const form = new FormData();
  form.append("files", new File(["bad"], "SKILL.md"));
  form.append("paths", "../SKILL.md");
  const response = await discover({
    request: new Request("http://localhost/api/skills/discover", {
      method: "POST",
      body: form,
    }),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_SKILL");
  expect(
    (await discover(request({ url: "https://example.org/skills" }))).status,
  ).toBe(400);
});
test("existing same-origin guard protects skill installation", async () => {
  const req = new Request("http://localhost/api/skills/install", {
    method: "POST",
    headers: { origin: "https://other.test" },
    body: "{}",
  });
  const response = await handle({
    event: { request: req, url: new URL(req.url) } as any,
    resolve: async () => new Response("not reached"),
  });
  expect(response.status).toBe(403);
});

test("catalog installation resolves its source and installs in a single request", async () => {
  root = await mkdtemp(join(tmpdir(), "skill-http-"));
  vi.stubEnv("DATA_DIR", root);
  const sha = "b".repeat(40);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/anthropics/skills/commits/main")
      return Response.json({ sha });
    if (url.includes("/commits/")) return new Response("", { status: 422 });
    if (
      url ===
      `https://api.github.com/repos/anthropics/skills/git/trees/${sha}?recursive=1`
    )
      return Response.json({
        sha,
        truncated: false,
        tree: [
          {
            path: "skills/pdf/SKILL.md",
            type: "blob",
            mode: "100644",
            size: 60,
            sha: "1",
          },
        ],
      });
    if (
      url ===
      `https://raw.githubusercontent.com/anthropics/skills/${sha}/skills/pdf/SKILL.md`
    )
      return new Response(
        "---\nname: pdf\ndescription: Work with PDF files\n---\nInstructions",
      );
    throw Error(`Unexpected fetch: ${url}`);
  });
  try {
    const response = await install(request({ catalogId: "pdf" }));
    expect(response.status).toBe(201);
    expect((await response.json())[0].name).toBe("pdf");
    const list = await (await GET()).json();
    expect(list.installed[0].source).toBe(
      `https://github.com/anthropics/skills/tree/${sha}/skills/pdf`,
    );
    expect((await install(request({ catalogId: "pdf" }))).status).toBe(409);
  } finally {
    vi.unstubAllGlobals();
  }
});

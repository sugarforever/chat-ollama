import { expect, test } from "vitest";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
// Catches opening the same SQLite files twice when Node bootstrap and SvelteKit
// compile startup.ts into separate modules in the same application process.
test("independently bundled startup modules share one process owner", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".startup-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = join(directory, "data");
  try {
    for (const name of ["server", "routes"])
      await build({
        entryPoints: ["src/lib/server/startup.ts"],
        outfile: join(directory, `${name}.mjs`),
        bundle: true,
        platform: "node",
        format: "esm",
        packages: "external",
        logLevel: "silent",
      });
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
      import assert from 'node:assert/strict';
      const server = await import(${JSON.stringify(pathToFileURL(join(directory, "server.mjs")).href)});
      const routes = await import(${JSON.stringify(pathToFileURL(join(directory, "routes.mjs")).href)});
      const first = await server.startup();
      const second = await routes.startup();
      await first.close();
      await second.close();
      assert.strictEqual(first, second, 'bootstrap and routes must share one manager');
    `,
      ],
      { encoding: "utf8", env: process.env },
    );
    expect(result.status, result.stderr).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

import { cp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const arch = process.argv[2] || process.arch;
if (process.platform !== "darwin" || !["arm64", "x64"].includes(arch))
  throw new Error("Desktop packaging currently supports macOS arm64 and x64");
if (!process.versions.node.startsWith("24."))
  throw new Error("Use Node 24 to prepare the desktop app");
const root = resolve(".desktop");
const backend = join(root, "backend");
const app = join(root, "app");
const version = process.env.CHATOLLAMA_DESKTOP_VERSION || "0.1.0";
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
  throw new Error("Invalid desktop release version");
await rm(backend, { recursive: true, force: true });
await rm(app, { recursive: true, force: true });
await mkdir(backend, { recursive: true });
await mkdir(app, { recursive: true });
for (const file of [
  "main.cjs",
  "preload.cjs",
  "url-policy.cjs",
  "backend-client.mjs",
])
  await cp(join("desktop", file), join(app, file));
await writeFile(
  join(app, "package.json"),
  JSON.stringify({
    name: "chatollama-desktop",
    version,
    private: true,
    description: "ChatOllama desktop",
    author: "ChatOllama contributors",
    main: "main.cjs",
  }),
);
for (const file of ["build", "server.mjs", "package.json", "pnpm-lock.yaml"])
  await cp(file, join(backend, file), { recursive: true });
await mkdir(join(backend, "desktop"));
await cp(
  "desktop/backend-owner.mjs",
  join(backend, "desktop/backend-owner.mjs"),
);
// Include both macOS native optional-dependency variants for cross-architecture packaging.
await writeFile(
  join(backend, "pnpm-workspace.yaml"),
  "packages:\n  - .\nsupportedArchitectures:\n  os: [darwin]\n  cpu: [arm64, x64]\n",
);
execFileSync(
  "pnpm",
  ["install", "--prod", "--frozen-lockfile", "--ignore-scripts"],
  {
    cwd: backend,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  },
);

const name = `node-v24.22.2-darwin-${arch}`;
const hashes = {
  arm64: "aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a",
  x64: "d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52",
};
const cache = join(root, `${name}.tar.gz`);
let archive;
try {
  archive = await readFile(cache);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!archive) {
  const response = await fetch(
    `https://nodejs.org/dist/v24.22.2/${name}.tar.gz`,
  );
  if (!response.ok) throw new Error(`Node download failed: ${response.status}`);
  archive = Buffer.from(await response.arrayBuffer());
}
if (createHash("sha256").update(archive).digest("hex") !== hashes[arch])
  throw new Error("Node archive checksum mismatch");
await writeFile(cache, archive);
await rm(join(root, "runtime"), { recursive: true, force: true });
await mkdir(join(root, "runtime"), { recursive: true });
execFileSync("tar", [
  "-xzf",
  cache,
  "-C",
  join(root, "runtime"),
  "--strip-components=1",
  `${name}/bin/node`,
  `${name}/LICENSE`,
]);
await chmod(join(root, "runtime/bin/node"), 0o755);
console.log(`Desktop resources prepared for macOS ${arch}`);

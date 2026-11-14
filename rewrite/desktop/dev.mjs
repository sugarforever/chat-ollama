import { spawn } from "node:child_process";
import electron from "electron";
if (process.versions.node.split(".")[0] !== "24")
  throw new Error("Desktop development requires Node 24");
const child = spawn(electron, ["desktop/main.cjs"], {
  stdio: "inherit",
  env: { ...process.env, CHATOLLAMA_NODE: process.execPath },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

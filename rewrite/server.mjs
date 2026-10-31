import { createServer } from "node:http";
import { startup } from "./build/startup.js";
const runtime = await startup();
// Multipart overhead plus the application-enforced 10 MiB file limit.
process.env.BODY_SIZE_LIMIT ||= String(10 * 1024 * 1024 + 65536);
const { handler } = await import("./build/handler.js");
const server = createServer(handler);
server.listen(Number(process.env.PORT || 3000), process.env.HOST || "0.0.0.0");
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await runtime.close();
  server.closeAllConnections();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

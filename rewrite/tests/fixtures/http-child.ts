import { createServer } from "node:http";
const { startup } = await import(
  new URL("../../build/startup.js", import.meta.url).href
);
const runtime = await startup();
process.env.PROTOCOL_HEADER = "x-fixture-protocol";
const { handler } = await import(
  new URL("../../build/handler.js", import.meta.url).href
);
const server = createServer((req, res) => {
  req.headers["x-fixture-protocol"] = "http";
  handler(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
process.send?.({ port: (server.address() as { port: number }).port });
process.on("message", async () => {
  server.close();
  server.closeAllConnections();
  await runtime.close();
  process.exit(0);
});

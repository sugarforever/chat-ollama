import { createServer, type ServerResponse } from "node:http";
export async function modelServer(options: { failure?: boolean; firstTool?: boolean } = {}) {
  const requests: { path: string; prompt: string; authorization?: string }[] =
    [];
  const pending = new Set<ServerResponse>();
  let hold = true;
  let finished = 0;
  const finish = (res: ServerResponse) => {
    const chunk = (delta: object, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    const tool = options.firstTool && finished++ === 0;
    chunk(tool ? { role: "assistant", tool_calls: [{ index: 0, id: "native", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "printf ready" }) } }] } : { role: "assistant", content: "Recovered answer" });
    chunk({}, tool ? "tool_calls" : "stop");
    res.end("data: [DONE]\n\n");
  };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      path: req.url!,
      prompt: body,
      authorization: req.headers.authorization,
    });
    if (options.failure) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'fixture-secret upstream failure' } })); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.flushHeaders();
    pending.add(res);
    res.on("close", () => pending.delete(res));
    if (!hold) finish(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${address.port}/custom/v1`,
    requests,
    partial() {
      for (const res of pending) res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Partial answer" }, finish_reason: null }] })}\n\n`);
    },
    release() {
      hold = false;
      for (const res of pending) finish(res);
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

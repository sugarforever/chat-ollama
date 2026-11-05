import { createServer, type ServerResponse } from "node:http";
export async function modelServer() {
  const requests: { path: string; prompt: string; authorization?: string }[] =
    [];
  const pending = new Set<ServerResponse>();
  let hold = true;
  const finish = (res: ServerResponse) => {
    const chunk = (delta: object, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    chunk({ role: "assistant", content: "Recovered answer" });
    chunk({}, "stop");
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

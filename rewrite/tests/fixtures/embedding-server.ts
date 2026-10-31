import { createServer } from "node:http";
// A genuine HTTP OpenAI-compatible protocol fixture; multilingual semantic axes
// are deterministic so tests need no model download/network/secret.
export function fixtureVector(text: string) {
  return [
    /(apple|orchard|苹果|果园)/i.test(text) ? 1 : 0,
    /(ocean|whale|海洋|鲸鱼)/i.test(text) ? 1 : 0,
    /(planet|mars|行星|火星)/i.test(text) ? 1 : 0,
    0.01,
  ];
}
export async function embeddingServer() {
  let fail = false,
    invalid: boolean | "mixed" | "zero" = false,
    hold = false;
  const pending: (() => void)[] = [];
  const requests: { input: string[]; model: string; authorization?: string }[] =
    [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push({ ...body, authorization: req.headers.authorization });
    if (hold) await new Promise<void>((r) => pending.push(r));
    if (fail) {
      res.writeHead(503);
      res.end("private-embedding-secret");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        object: "list",
        data: body.input
          .map((s: string, index: number) => ({
            index,
            object: "embedding",
            embedding:
              invalid === "mixed"
                ? index
                  ? [1, 0]
                  : fixtureVector(s)
                : invalid === "zero"
                  ? [0, 0, 0, 0]
                  : invalid
                    ? index
                      ? [1, 0]
                      : []
                    : fixtureVector(s),
          }))
          .reverse(),
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    config: {
      baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
      modelId: "multilingual-fixture",
      apiKey: "embedding-fixture-key",
    },
    requests,
    fail(value: boolean) {
      fail = value;
    },
    invalid(value: boolean | "mixed" | "zero") {
      invalid = value;
    },
    hold(value: boolean) {
      hold = value;
      if (!value) pending.splice(0).forEach((r) => r());
    },
    async close() {
      pending.splice(0).forEach((r) => r());
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

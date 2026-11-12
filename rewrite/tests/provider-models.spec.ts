import { afterEach, expect, test, vi } from "vitest";
import { discoverModels } from "../src/lib/server/provider-models";
import { captureModel } from "../src/lib/server/providers";
afterEach(() => vi.unstubAllGlobals());
test("model discovery authenticates server-side, ranks creation times, and admits newly discovered IDs", async () => {
  const fetcher = vi.fn(async () => Response.json({data:[{id:"older",created:10},{id:"new-model",created:20},{id:"embedding-model",created:30}]}));
  vi.stubGlobal("fetch", fetcher);
  const result=await discoverModels({service:"moonshotai",apiKey:"private-key"});
  expect(result).toEqual({models:["new-model","older"],defaultModelId:"new-model"});
  const [url, options] = fetcher.mock.calls[0] as unknown as [URL,RequestInit];
  expect(url.href).toBe("https://api.moonshot.ai/v1/models");
  expect(options).toMatchObject({headers:{authorization:"Bearer private-key"},redirect:"error"});
  expect(JSON.stringify(result)).not.toContain("private-key");
  expect(captureModel("moonshotai","new-model","https://api.moonshot.ai/v1","openai-completions",result.models)).toMatchObject({id:"new-model",api:"openai-completions"});
  vi.stubGlobal("fetch",async()=>new Response("private upstream error",{status:401}));
  await expect(discoverModels({service:"moonshotai",apiKey:"bad-key"})).rejects.toThrow("Connection failed");
});

test("DeepSeek discovery distinguishes upstream rejection from network failure without exposing secrets", async () => {
  vi.stubGlobal("fetch", async () => new Response("private upstream details", { status: 429 }));
  await expect(discoverModels({ service: "deepseek", apiKey: "private-key" })).rejects.toMatchObject({
    status: 502, message: "Provider rate limit reached. Wait a moment and retry.",
  });
  vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed with private-key"); });
  await expect(discoverModels({ service: "deepseek", apiKey: "private-key" })).rejects.toMatchObject({
    status: 502, message: "Cannot reach the provider from the server. Check the server network connection and retry.",
  });
});

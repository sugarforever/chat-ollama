<script lang="ts">
  import { Server } from "@lucide/svelte";
  export let service: string | undefined = undefined;
  export let name = "";
  export let baseUrl = "";
  // Presentation only: provider availability and model catalogs remain server-owned.
  const logos: Record<string, string> = {
    "amazon-bedrock": "bedrock-color.svg",
    "ant-ling": "ling-color.svg",
    anthropic: "anthropic.svg",
    azure: "azure-color.svg",
    baseten: "baseten.svg",
    cerebras: "cerebras-color.svg",
    "cloudflare-ai-gateway": "cloudflare-color.svg",
    "cloudflare-workers-ai": "cloudflare-color.svg",
    deepseek: "deepseek-color.svg",
    fireworks: "fireworks-color.svg",
    "github-copilot": "githubcopilot.svg",
    google: "google-color.svg",
    "google-vertex": "vertexai-color.svg",
    groq: "groq.svg",
    huggingface: "huggingface-color.svg",
    "kimi-coding": "kimi-color.svg",
    meta: "meta-color.svg",
    minimax: "minimax-color.svg",
    "minimax-cn": "minimax-color.svg",
    mistral: "mistral-color.svg",
    moonshotai: "moonshot.svg",
    "moonshotai-cn": "moonshot.svg",
    nvidia: "nvidia-color.svg",
    openai: "openai.svg",
    "openai-codex": "codex-color.svg",
    opencode: "opencode.svg",
    "opencode-go": "opencode.svg",
    openrouter: "openrouter-color.svg",
    "qwen-token-plan": "qwen-color.svg",
    "qwen-token-plan-cn": "qwen-color.svg",
    "qwen-token-plan-individual": "qwen-color.svg",
    "qwen-token-plan-individual-cn": "qwen-color.svg",
    together: "together-color.svg",
    typesafe: "typesafeai.svg",
    "vercel-ai-gateway": "vercel.svg",
    xai: "xai.svg",
    xiaomi: "xiaomimimo.svg",
    "xiaomi-token-plan-ams": "xiaomimimo.svg",
    "xiaomi-token-plan-cn": "xiaomimimo.svg",
    "xiaomi-token-plan-sgp": "xiaomimimo.svg",
    zai: "zai.svg",
    "zai-coding-cn": "zai.svg",
    ollama: "ollama.svg",
    lmstudio: "lmstudio.svg",
    radius: "radius.svg",
  };
  function logoFor(service: string | undefined, name: string, baseUrl: string) {
    if (service && logos[service]) return logos[service];
    if (service && service !== "custom") return undefined;
    if (/^(local\s+)?ollama$/i.test(name.trim())) return logos.ollama;
    if (/^lm[ -]?studio$/i.test(name.trim())) return logos.lmstudio;
    try {
      const endpoint = new URL(baseUrl);
      if (endpoint.port === "11434") return logos.ollama;
      if (endpoint.port === "1234") return logos.lmstudio;
    } catch {}
    return undefined;
  }
  $: logo = logoFor(service, name, baseUrl);
</script>

{#if logo}
  <img
    src={`/provider-logos/${logo}`}
    alt=""
    aria-hidden="true"
    width="24"
    height="24"
  />
{:else}
  <Server class="shrink-0" size={24} strokeWidth={1.75} aria-hidden="true" />
{/if}

<style>
  img {
    display: block;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    object-fit: contain;
    color-scheme: light;
  }
</style>

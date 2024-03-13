import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";

export const OPENAI_GPT_MODELS = [
  "gpt-3.5-turbo",
  "gpt-4",
  "gpt-4-32k",
  "gpt-4-turbo-preview"
];

export const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-large",
  "text-embedding-3-small",
  "text-embedding-ada-002"
];

export const ANTHROPIC_MODELS = [
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2"
];

export const createEmbeddings = (embeddingModelName: string, event): Embeddings => {
  if (OPENAI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for OpenAI model: ${embeddingModelName}`);
    return new OpenAIEmbeddings({
      modelName: embeddingModelName,
      openAIApiKey: event.context?.keys?.x_openai_api_key
    });
  } else {
    console.log(`Creating embeddings for Ollama served model: ${embeddingModelName}`);
    return new OllamaEmbeddings({
      model: embeddingModelName,
      baseUrl: event.context?.ollama?.host
    });
  }
}

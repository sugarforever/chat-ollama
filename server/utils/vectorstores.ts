import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Embeddings } from "@langchain/core/embeddings";

export const createChromaVectorStore = (embeddings: Embeddings, collectionName: string) => {
  return new Chroma(embeddings, {
    collectionName,
    url: process.env.CHROMADB_URL
  })
};

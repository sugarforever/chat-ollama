import { Chroma } from "@langchain/community/vectorstores/chroma"
import { Milvus } from "@langchain/community/vectorstores/milvus"
import { Embeddings } from "@langchain/core/embeddings"
import type { VectorStoreInterface } from "@langchain/core/vectorstores"

const createChromaVectorStore = (embeddings: Embeddings, collectionName: string): VectorStoreInterface => {
  console.log("Creating Chroma vector store")
  return new Chroma(embeddings, {
    collectionName,
    url: process.env.CHROMADB_URL
  })
}

const createMilvusVectorStore = (embeddings: Embeddings, collectionName: string): VectorStoreInterface => {
  console.log("Creating Milvus vector store")
  return new Milvus(embeddings, {
    collectionName,
    url: process.env.MILVUS_URL
  })
}

export const createVectorStore = (embeddings: Embeddings, collectionName: string): VectorStoreInterface => {
  if (process.env.VECTOR_STORE === 'milvus') {
    return createMilvusVectorStore(embeddings, collectionName)
  } else {
    return createChromaVectorStore(embeddings, collectionName)
  }
}

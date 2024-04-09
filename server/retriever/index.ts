import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { Embeddings } from "@langchain/core/embeddings"
import { ParentDocumentRetriever } from "langchain/retrievers/parent_document"
import { RedisDocstore } from '@/server/docstore/redis'
import { createVectorStore } from '@/server/utils/vectorstores'

export const createRetriever = async (embeddings: Embeddings, collectionName: string) => {
  const vectorStore = createVectorStore(embeddings, collectionName)
  if (process.env.VERTOR_STORE === 'chroma') {
    await vectorStore.ensureCollection()
  }

  let retriever = null

  if (process.env.REDIS_HOST) {
    console.log("Initializing ParentDocumentRetriever with RedisDocstore")
    retriever = new ParentDocumentRetriever({
      vectorstore: vectorStore,
      docstore: new RedisDocstore(collectionName),
      parentSplitter: new RecursiveCharacterTextSplitter({
        chunkOverlap: 200,
        chunkSize: 1000,
      }),
      childSplitter: new RecursiveCharacterTextSplitter({
        chunkOverlap: 50,
        chunkSize: 200,
      }),
      childK: 20,
      parentK: 4,
    })
  } else {
    console.log("Initializing vector store retriever")
    return vectorStore.asRetriever(4)
  }

  return retriever
}

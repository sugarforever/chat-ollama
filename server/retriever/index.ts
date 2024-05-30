import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { Embeddings } from "@langchain/core/embeddings"
import { Document } from "@langchain/core/documents"
import { ParentDocumentRetriever } from "langchain/retrievers/parent_document"
import { RedisDocstore } from '@/server/docstore/redis'
import { createVectorStore } from '@/server/utils/vectorstores'

export const createRetriever = async (embeddings: Embeddings, collectionName: string, documents: Document[] | null = null) => {
  const vectorStore = createVectorStore(embeddings, collectionName)
  if (process.env.VECTOR_STORE === 'chroma') {
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
      parentK: 10,
    })

    if (documents !== null) {
      await retriever.addDocuments(documents)
    }

    return retriever
  } else {
    console.log("Initializing vector store retriever")

    if (documents !== null) {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkOverlap: 200,
        chunkSize: 1000,
      })
      const splits = await splitter.splitDocuments(documents)
      await vectorStore.addDocuments(splits)
    }

    return vectorStore.asRetriever(4)
  }
}

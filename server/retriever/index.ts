import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { Embeddings } from "@langchain/core/embeddings"
import { Document } from "@langchain/core/documents"
import { ParentDocumentRetriever } from "langchain/retrievers/parent_document"
import { RedisDocstore } from '@/server/docstore/redis'
import { createVectorStore } from '@/server/utils/vectorstores'

export const createRetriever = async (
  embeddings: Embeddings,
  collectionName: string,
  documents: Document[] | null = null,
  parentChunkSize: number = 3000,
  parentChunkOverlap: number = 200,
  childChunkSize: number = 1000,
  childChunkOverlap: number = 50,
  parentK: number = 10,
  childK: number = 20
) => {
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
        chunkOverlap: parentChunkOverlap,
        chunkSize: parentChunkSize,
      }),
      childSplitter: new RecursiveCharacterTextSplitter({
        chunkOverlap: childChunkOverlap,
        chunkSize: childChunkSize,
      }),
      childK: childK,
      parentK: parentK,
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
        chunkSize: 3000,
      })
      const splits = await splitter.splitDocuments(documents)
      await vectorStore.addDocuments(splits)
    }

    return vectorStore.asRetriever(4)
  }
}

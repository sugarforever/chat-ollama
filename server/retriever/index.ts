import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Embeddings } from "@langchain/core/embeddings";
import { ParentDocumentRetriever } from "langchain/retrievers/parent_document";
import { RedisDocstore } from '@/server/docstore/redis';

export const createRetriever = async (embeddings: Embeddings, collectionName: string) => {
  const dbConfig = {
    collectionName: collectionName,
    url: process.env.CHROMADB_URL
  };
  const chromaClient = new Chroma(embeddings, dbConfig);
  await chromaClient.ensureCollection();
  // await chromaClient.addDocuments(splits);

  let retriever = null;

  if (process.env.REDIS_HOST) {
    console.log("Initializing ParentDocumentRetriever with RedisDocstore");
    retriever = new ParentDocumentRetriever({
      vectorstore: chromaClient,
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
      parentK: 5,
    });
  } else {
    console.log("Initializing vector store retriever");
    return chromaClient.asRetriever(4);
  }

  return retriever;
}

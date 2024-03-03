import { writeFile } from 'fs/promises';
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { PrismaClient } from '@prisma/client';

const ingestDocument = async (file, collectionName, embedding) => {
  const tmp_file_path = `tmp/${file.filename}`;

  try {
    const status = await writeFile(tmp_file_path, file.data)
    console.log(`Writing data to file ${tmp_file_path}: ${status}`);

    const loader = new PDFLoader(tmp_file_path);
    const docs = await loader.load();

    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const splits = await textSplitter.splitDocuments(docs);
    const embeddings = new OllamaEmbeddings({
      model: embedding,
      baseUrl: "http://localhost:11434",
    });
    await Chroma.fromDocuments(splits, embeddings, {
      collectionName: collectionName,
      url: "http://localhost:8000"
    });

    console.log(`Chroma collection ${collectionName} created`);
  } catch (err) {
    console.error(err)
  }
}

export default defineEventHandler(async (event) => {
  const items = await readMultipartFormData(event);

  const knowledgeBase: { [key: string]: string | Date } = {};
  const decoder = new TextDecoder("utf-8");
  let uploadedFile = null;
  items?.forEach((item) => {
    const { name, data, filename } = item;
    if (name) {
      if (name === "file") {
        uploadedFile = item;
        knowledgeBase["filename"] = filename;
      }
      if (["name", "description", "embedding"].includes(name)) {
        knowledgeBase[name] = decoder.decode(data);
      }
    }
  });

  const prisma = new PrismaClient();
  knowledgeBase.created = new Date();
  const affected = await prisma.knowledgeBase.create({
    data: knowledgeBase
  });
  console.log(`Created knowledge base ${knowledgeBase.name} for ${knowledgeBase.filename}: ${affected}`);

  if (uploadedFile) {
    await ingestDocument(uploadedFile, `collection_${affected.id}`, affected.embedding);
  }

  console.log(knowledgeBase);

  return {
    status: "success"
  }
})

import { Document } from "@langchain/core/documents"
import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { TextLoader } from "langchain/document_loaders/fs/text"
import { JSONLoader } from "langchain/document_loaders/fs/json"
import { DocxLoader } from "langchain/document_loaders/fs/docx"
import { CSVLoader } from "langchain/document_loaders/fs/csv"
import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio"
import { RecursiveUrlLoader } from "langchain/document_loaders/web/recursive_url"
import { compile } from "html-to-text"
import { MultiPartData, H3Event } from 'h3'
import { createRetriever } from '@/server/retriever'
import type { PageParser } from '@/server/types'

export const loadDocuments = async (file: MultiPartData) => {
  const Loaders = {
    pdf: PDFLoader,
    json: JSONLoader,
    csv: CSVLoader,
    docx: DocxLoader,
    doc: DocxLoader,
    txt: TextLoader,
    md: TextLoader,
  } as const

  const ext = (file.filename?.match(/\.(\w+)$/)?.[1] || 'txt').toLowerCase() as keyof typeof Loaders
  if (!Loaders[ext]) {
    throw new Error(`Unsupported file type: ${ext}`)
  }
  const blob = new Blob([file.data], { type: file.type })
  return new Loaders[ext](blob).load()
}

export const loadURL = async (url: string, pageParser: PageParser) => {
  console.log("URL: ", url)
  if (pageParser === 'jinaReader') {
    console.log("Using Jina reader to load URL")
    const jinaUrl = `https://r.jina.ai/${url}`
    const response = await fetch(jinaUrl)
    const data = await response.text()
    return [
      new Document({
        pageContent: data,
        metadata: { source: url }
      })
    ]
  } else {
    /*console.log("Using CheerioWebBaseLoader to load URL")
    const loader = new CheerioWebBaseLoader(url)
    const docs = await loader.load()
    console.log(`Documents loaded and parsed from ${url}:`, docs)*/

    const compiledConvert = compile({ wordwrap: 130 }) // returns (text: string) => string;

    const loader = new RecursiveUrlLoader(url, {
      extractor: compiledConvert,
      maxDepth: 1
    })

    const docs = await loader.load()
    return docs
  }
}

export const ingestDocument = async (
  files: MultiPartData[],
  collectionName: string,
  embedding: string,
  event: H3Event
) => {
  const docs = []

  for (const file of files) {
    const loadedDocs = await loadDocuments(file)
    loadedDocs.forEach((doc) => doc.metadata.source = file.filename)
    docs.push(...loadedDocs)
  }

  const embeddings = createEmbeddings(embedding, event)
  const retriever = await createRetriever(embeddings, collectionName)

  await retriever.addDocuments(docs)

  console.log(`${docs.length} documents added to collection ${collectionName}.`)
}

export const ingestURLs = async (
  urls: string[],
  collectionName: string,
  embedding: string,
  event: H3Event
) => {
  const docs = []
  const { pageParser } = await parseKnowledgeBaseFormRequest(event)

  for (const url of urls) {
    const loadedDocs = await loadURL(url, pageParser)
    docs.push(...loadedDocs)
  }

  const embeddings = createEmbeddings(embedding, event)
  const retriever = await createRetriever(embeddings, collectionName)

  await retriever.addDocuments(docs)

  console.log(`${docs.length} URLs added to collection ${collectionName}.`)
}

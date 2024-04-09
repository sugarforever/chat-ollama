import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { TextLoader } from "langchain/document_loaders/fs/text"
import { JSONLoader } from "langchain/document_loaders/fs/json"
import { DocxLoader } from "langchain/document_loaders/fs/docx"
import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer"
import { MultiPartData, H3Event } from 'h3'
import { createRetriever } from '@/server/retriever'

export const loadDocuments = async (file: MultiPartData) => {
  const Loaders = {
    pdf: PDFLoader,
    json: JSONLoader,
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

export const loadURL = async (url: string) => {
  console.log("URL: ", url)
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },
    gotoOptions: {
      waitUntil: "domcontentloaded",
    },
    async evaluate(page, browser) {
      const result = await page.evaluate(() => document.body.innerText)
      console.log("HTML result: ", result)
      await browser.close()
      return result
    },
  })
  const docs = await loader.load()
  console.log(`Documents loaded and parsed from ${url}:`, docs)
  return docs
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

  for (const url of urls) {
    const loadedDocs = await loadURL(url)
    docs.push(...loadedDocs)
  }

  const embeddings = createEmbeddings(embedding, event)
  const retriever = await createRetriever(embeddings, collectionName)

  await retriever.addDocuments(docs)

  console.log(`${docs.length} URLs added to collection ${collectionName}.`)
}

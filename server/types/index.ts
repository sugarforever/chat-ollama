import { MultiPartData } from 'h3'

export type PageParser = 'default' | 'jinaReader'

export type KnowledgeBaseFormData = {
  name: string
  description: string
  embedding: string
  isPublic: boolean
  knowledgeBaseId: number | null
  uploadedFiles: MultiPartData[]
  urls: string[]
  pageParser: PageParser
  maxDepth: number
  excludeGlobs: string[],
  chunking: {
    parentChunkSize: number,
    parentChunkOverlap: number,
    childChunkSize: number,
    childChunkOverlap: number,
    parentK: number,
    childK: number,
  }
}

export type ChunkSettings = {
  parentChunkSize: number
  parentChunkOverlap: number
  childChunkSize: number
  childChunkOverlap: number
  parentK: number
  childK: number
}

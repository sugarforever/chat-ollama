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
  excludeGlobs: string[]
}

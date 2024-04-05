import { MultiPartData } from 'h3'

export type KnowledgeBaseFormData = {
  name: string
  description: string
  embedding: string
  knowledgeBaseId: number | null
  uploadedFiles: MultiPartData[]
  urls: string[]
}

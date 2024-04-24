import { MultiPartData, type H3Event } from 'h3'
import type { KnowledgeBaseFormData, PageParser } from '@/server/types'

export const parseKnowledgeBaseFormRequest = async (event: H3Event): Promise<KnowledgeBaseFormData> => {
  const items = await readMultipartFormData(event)

  const decoder = new TextDecoder("utf-8")
  const uploadedFiles: MultiPartData[] = []
  const _knowledgeBaseId = event?.context?.params?.id

  const formData: KnowledgeBaseFormData = {
    name: '',
    description: '',
    embedding: '',
    isPublic: true,
    knowledgeBaseId: _knowledgeBaseId ? parseInt(_knowledgeBaseId) : null,
    uploadedFiles,
    urls: [],
    pageParser: 'default',
    maxDepth: 0,
    excludeGlobs: [],
  }

  items?.forEach((item) => {
    const key = (item.name || '') as keyof KnowledgeBaseFormData
    const decodedData = decoder.decode(item.data)

    if (key.startsWith("file_")) {
      formData.uploadedFiles.push(item)
    }

    switch (key) {
      case 'isPublic':
        formData.isPublic = decodedData === 'true'
        break

      case 'urls':
        formData.urls.push(decodedData)
        break

      case 'name':
        formData.name = decodedData
        break

      case 'description':
        formData.description = decodedData
        break

      case 'embedding':
        formData.embedding = decodedData
        break

      case 'pageParser':
        formData.pageParser = decodedData as PageParser
        break

      case 'maxDepth':
        formData.maxDepth = parseInt(decodedData)
        break

      case 'excludeGlobs':
        formData.excludeGlobs = decodedData.split(/[\n]+/g).filter(Boolean).map((glob) => glob.trim())
        break
    }
  })

  return formData
}

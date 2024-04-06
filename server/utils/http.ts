import { MultiPartData, type H3Event } from 'h3'
import { KnowledgeBaseFormData } from '@/server/types'

export const parseKnowledgeBaseFormRequest = async (event: H3Event): Promise<KnowledgeBaseFormData> => {
  const items = await readMultipartFormData(event)

  const decoder = new TextDecoder("utf-8")
  const uploadedFiles: MultiPartData[] = []

  let _name = ''
  let _description = ''
  let _embedding = ''
  const urls: string[] = []
  const _knowledgeBaseId = event?.context?.params?.id
  items?.forEach((item) => {
    const key = item.name || ''
    const decodedData = decoder.decode(item.data)
    if (key === 'urls') {
      urls.push(decodedData)
    }

    if (key.startsWith("file_")) {
      uploadedFiles.push(item)
    }

    if (key === 'name') {
      _name = decodedData
    }
    if (key === 'description') {
      _description = decodedData
    }
    if (key === 'embedding') {
      _embedding = decodedData
    }
  })

  const formData: KnowledgeBaseFormData = {
    name: _name,
    description: _description,
    embedding: _embedding,
    knowledgeBaseId: _knowledgeBaseId ? parseInt(_knowledgeBaseId) : null,
    uploadedFiles,
    urls: urls
  }

  return formData
}

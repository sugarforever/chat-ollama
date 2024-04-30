import prisma from '@/server/utils/prisma'
import { isOllamaModelExists, isApiEmbeddingModelExists } from '@/server/utils/models'
import { getOllama } from '@/server/utils/ollama'
import { ingestDocument, ingestURLs } from '~/server/utils/rag'
import { parseKnowledgeBaseFormRequest } from '@/server/utils/http'
import { requireKnowledgeBase, requireKnowledgeBaseOwner } from '~/server/utils/knowledgeBase'

export default defineEventHandler(async (event) => {
  const { knowledgeBaseId, uploadedFiles, urls, name, description, isPublic } = await parseKnowledgeBaseFormRequest(event)

  console.log("Knowledge base ID: ", knowledgeBaseId)

  const knowledgeBase = await requireKnowledgeBase(`${knowledgeBaseId}`)
  requireKnowledgeBaseOwner(event, knowledgeBase)

  if (uploadedFiles.length > 0 || urls.length > 0) {
    if (!isApiEmbeddingModelExists(knowledgeBase.embedding!)) {
      const ollama = await getOllama(event, true)
      if (!ollama) return
      if (!(await isOllamaModelExists(ollama, knowledgeBase.embedding!))) {
        setResponseStatus(event, 404)
        return {
          status: "error",
          message: "Embedding model does not exist in Ollama"
        }
      }
    }

    console.log(`Update knowledge base ${knowledgeBase.name} with ID ${knowledgeBase.id}`)

    try {
      await ingestDocument(uploadedFiles, `collection_${knowledgeBase.id}`, knowledgeBase.embedding!, event)
      for (const uploadedFile of uploadedFiles) {
        const createdKnowledgeBaseFile = await prisma.knowledgeBaseFile.create({
          data: {
            url: uploadedFile.filename!,
            knowledgeBaseId: knowledgeBase.id
          }
        })

        console.log("Knowledge base file created with ID: ", createdKnowledgeBaseFile.id)
      }

      await ingestURLs(urls, `collection_${knowledgeBase.id}`, knowledgeBase.embedding!, event)
      for (const url of urls) {
        const createdKnowledgeBaseFile = await prisma.knowledgeBaseFile.create({
          data: {
            url: url,
            knowledgeBaseId: knowledgeBase.id
          }
        })

        console.log("Knowledge base file created with ID: ", createdKnowledgeBaseFile.id)
      }
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId! },
    data: { name, description, is_public: isPublic }
  })

  return {
    status: "success"
  }
})

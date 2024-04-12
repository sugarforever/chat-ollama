import prisma from '@/server/utils/prisma'
import { isOllamaModelExists } from '@/server/utils/models'
import { getOllama } from '@/server/utils/ollama'
import { ingestDocument, ingestURLs } from '~/server/utils/rag'
import { parseKnowledgeBaseFormRequest } from '@/server/utils/http'

export default defineEventHandler(async (event) => {
  const { knowledgeBaseId, uploadedFiles, urls, name, description } = await parseKnowledgeBaseFormRequest(event)

  console.log("Knowledge base ID: ", knowledgeBaseId)

  let _knowledgeBase = knowledgeBaseId
    ? await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } })
    : null

  if (!_knowledgeBase) {
    setResponseStatus(event, 400)
    return {
      status: "error",
      message: "Must specify a valid knowledge base ID"
    }
  }

  if (uploadedFiles.length > 0 || urls.length > 0) {
    const ollama = await getOllama(event, true)
    if (!ollama) return
    if (!(await isOllamaModelExists(ollama, _knowledgeBase.embedding!))) {
      setResponseStatus(event, 404)
      return {
        status: "error",
        message: "Embedding model does not exist in Ollama"
      }
    }

    console.log(`Update knowledge base ${_knowledgeBase.name} with ID ${_knowledgeBase.id}`)

    try {
      await ingestDocument(uploadedFiles, `collection_${_knowledgeBase.id}`, _knowledgeBase.embedding!, event)
      for (const uploadedFile of uploadedFiles) {
        const createdKnowledgeBaseFile = await prisma.knowledgeBaseFile.create({
          data: {
            url: uploadedFile.filename!,
            knowledgeBaseId: _knowledgeBase.id
          }
        })

        console.log("Knowledge base file created with ID: ", createdKnowledgeBaseFile.id)
      }

      await ingestURLs(urls, `collection_${_knowledgeBase.id}`, _knowledgeBase.embedding!, event)
      for (const url of urls) {
        const createdKnowledgeBaseFile = await prisma.knowledgeBaseFile.create({
          data: {
            url: url,
            knowledgeBaseId: _knowledgeBase.id
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
    data: { name, description }
  })

  return {
    status: "success"
  }
})

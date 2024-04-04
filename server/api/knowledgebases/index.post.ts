import { MultiPartData, type H3Event } from 'h3'
import prisma from '@/server/utils/prisma'
import { isOllamaModelExists } from '@/server/utils/models'
import { getOllama } from '@/server/utils/ollama'
import { ingestDocument } from '~/server/utils/rag'
import { parseKnowledgeBaseFormRequest } from '@/server/utils/http'

export default defineEventHandler(async (event) => {

  const { name, description, embedding, uploadedFiles } =
    await parseKnowledgeBaseFormRequest(event)

  if (uploadedFiles.length === 0) {
    setResponseStatus(event, 400)
    return {
      status: "error",
      message: "Must upload at least one file"
    }
  }

  const ollama = await getOllama(event, true)
  if (!ollama) return
  if (!(await isOllamaModelExists(ollama, embedding))) {
    setResponseStatus(event, 404)
    return {
      status: "error",
      message: "Embedding model does not exist in Ollama"
    }
  }

  const exist = await prisma.knowledgeBase.count({ where: { name: name } }) > 0
  if (exist) {
    setResponseStatus(event, 409)
    return {
      status: "error",
      message: "Knowledge Base's Name already exist"
    }
  }

  const affected = await prisma.knowledgeBase.create({
    data: {
      name: name,
      description: description,
      embedding: embedding,
      created: new Date(),
    }
  })
  console.log(`Created knowledge base ${name}: ${affected.id}`)

  try {
    await ingestDocument(uploadedFiles, `collection_${affected.id}`, affected.embedding!, event)
    for (const uploadedFile of uploadedFiles) {
      const createdKnowledgeBaseFile = await prisma.knowledgeBaseFile.create({
        data: {
          url: uploadedFile.filename!,
          knowledgeBaseId: affected.id
        }
      })

      console.log("KnowledgeBaseFile with ID: ", createdKnowledgeBaseFile.id)
    }
  } catch (e) {
    await prisma.knowledgeBase.delete({
      where: {
        id: affected.id
      }
    })
    throw e
  }

  return {
    status: "success"
  }
})

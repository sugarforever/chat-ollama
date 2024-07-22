import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama"
import { Embeddings } from "@langchain/core/embeddings"
import { OpenAIEmbeddings } from "@langchain/openai"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/community/chat_models/ollama"
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from "~/server/models/genai/generative-ai"
import { ChatGroq } from "@langchain/groq"
import { AzureChatOpenAI } from "@langchain/azure-openai"
import { type H3Event } from 'h3'
import { type Ollama } from 'ollama'
import { proxyTokenGenerate } from '~/server/utils/proxyToken'
import { ANTHROPIC_MODELS, AZURE_OPENAI_GPT_MODELS, GEMINI_EMBEDDING_MODELS, GEMINI_MODELS, GROQ_MODELS, MODEL_FAMILIES, MOONSHOT_MODELS, OPENAI_EMBEDDING_MODELS, OPENAI_GPT_MODELS } from '~/config/index'
import type { ContextKeys } from '~/server/middleware/keys'

export function isApiEmbeddingModelExists(embeddingModelName: string) {
  return [...OPENAI_EMBEDDING_MODELS, ...GEMINI_EMBEDDING_MODELS].includes(embeddingModelName)
}

export async function isOllamaModelExists(ollama: Ollama, embeddingModelName: string) {
  const res = await ollama.list()
  return res.models.some(model => model.name.includes(embeddingModelName))
}

export const createEmbeddings = (embeddingModelName: string, event: H3Event): Embeddings => {
  const keys = event.context.keys
  if (OPENAI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for OpenAI model: ${embeddingModelName}, host: ${keys.openai.endpoint}`)
    return new OpenAIEmbeddings({
      configuration: {
        baseURL: getProxyEndpoint(keys.openai.endpoint, keys.openai.proxy),
      },
      modelName: embeddingModelName,
      openAIApiKey: keys.openai.key,
    })
  } else if (GEMINI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for Gemini model: ${embeddingModelName}`)
    return new GoogleGenerativeAIEmbeddings({
      modelName: embeddingModelName,
      apiKey: keys.gemini.key,
    })
  } else {
    console.log(`Creating embeddings for Ollama served model: ${embeddingModelName}`)
    return new OllamaEmbeddings({
      model: embeddingModelName,
      baseUrl: keys.ollama.endpoint,
    })
  }
}

function openaiApiFillPath(endpoint: string) {
  if (endpoint && !/\/v\d$/i.test(endpoint)) {
    endpoint = endpoint.replace(/\/+$/, '') + '/v1'
  }
  return endpoint
}

type InitChatParams = { key: string, endpoint: string, proxy?: boolean, deploymentName?: string }
function initChat(family: string, modelName: string, params: InitChatParams, isCustomModel = false) {
  console.log(`Chat with [${family} ${modelName}]`, params.endpoint ? `, Host: ${params.endpoint}` : '')
  let endpoint = getProxyEndpoint(params.endpoint, params?.proxy || false)

  if (family === MODEL_FAMILIES.openai && (isCustomModel || OPENAI_GPT_MODELS.includes(modelName))) {
    return new ChatOpenAI({
      configuration: { baseURL: openaiApiFillPath(endpoint) },
      openAIApiKey: params.key,
      modelName: modelName,
    })
  }

  if (family === MODEL_FAMILIES.azureOpenai && (isCustomModel || AZURE_OPENAI_GPT_MODELS.includes(modelName))) {
    return new AzureChatOpenAI({
      azureOpenAIEndpoint: endpoint,
      azureOpenAIApiKey: params.key,
      azureOpenAIApiDeploymentName: params.deploymentName,
      modelName: modelName,
    })
  }

  if (family === MODEL_FAMILIES.anthropic && (isCustomModel || ANTHROPIC_MODELS.includes(modelName))) {
    return new ChatAnthropic({
      anthropicApiUrl: endpoint,
      anthropicApiKey: params.key,
      modelName: modelName,
    })
  }

  if (family === MODEL_FAMILIES.moonshot && (isCustomModel || MOONSHOT_MODELS.includes(modelName))) {
    // Reuse openai's sdk
    const endpoint = params.endpoint || "https://api.moonshot.cn/v1"
    return new ChatOpenAI({
      configuration: { baseURL: openaiApiFillPath(endpoint) },
      openAIApiKey: params.key,
      modelName: modelName
    })
  }

  if (family === MODEL_FAMILIES.gemini && (isCustomModel || GEMINI_MODELS.includes(modelName))) {
    return new ChatGoogleGenerativeAI({
      apiVersion: "v1beta",
      apiKey: params.key,
      modelName: modelName,
      baseUrl: endpoint,
    })
  }

  if (family === MODEL_FAMILIES.groq && (isCustomModel || GROQ_MODELS.includes(modelName))) {
    // @langchain/grop does not support configuring groq's baseURL, but groq sdk supports receiving environment variables.
    if (params.endpoint) {
      process.env.GROQ_BASE_URL = getProxyEndpoint(params.endpoint, params?.proxy || false)
    }
    return new ChatGroq({
      apiKey: params.key,
      verbose: true,
      modelName: modelName,
    })
  }

  return null
}

export const createChatModel = (modelName: string, family: string, event: H3Event): BaseChatModel => {
  const keys = event.context.keys
  const [familyValue] = Object.entries(MODEL_FAMILIES).find(([key, val]) => val === family) || []

  if (familyValue) {
    const data = keys[familyValue as Exclude<keyof ContextKeys, 'ollama' | 'custom'>]
    return initChat(family, modelName, data)!
  }

  const customModel = keys.custom.find(el => el.name === family)
  if (customModel && MODEL_FAMILIES.hasOwnProperty(customModel.aiType)) {
    return initChat(MODEL_FAMILIES[customModel.aiType as keyof typeof MODEL_FAMILIES], modelName, customModel, true)!
  }

  console.log("Chat with Ollama, Host:", keys.ollama.endpoint)
  return new ChatOllama({
    baseUrl: keys.ollama.endpoint,
    model: modelName,
    numPredict: 3000
  })
}

function getProxyEndpoint(endpoint: string, useProxy: boolean) {
  const config = useRuntimeConfig()
  const port = process.env.PORT || 3000
  if (useProxy && endpoint && config.public.modelProxyEnabled && config.modelProxyUrl) {
    console.log('Proxy:', endpoint, '->', config.modelProxyUrl)

    const link = `http://${process.env.HOST || 'localhost'}:${port}/api/proxy?token=${proxyTokenGenerate()}&endpoint=${endpoint}` // keep endpoint param at the end
    return link
  }
  return endpoint ?? undefined
}

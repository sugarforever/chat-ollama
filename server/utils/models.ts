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

export const createChatModel = (modelName: string, family: string, event: H3Event): BaseChatModel => {
  const keys = event.context.keys
  let chat = null
  if (family === MODEL_FAMILIES.openai && OPENAI_GPT_MODELS.includes(modelName)) {
    console.log("Chat with OpenAI, host:", keys.openai?.endpoint)
    chat = new ChatOpenAI({
      configuration: {
        baseURL: getProxyEndpoint(keys.openai.endpoint, keys.openai.proxy),
      },
      openAIApiKey: keys.openai.key,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.azureOpenai && AZURE_OPENAI_GPT_MODELS.includes(modelName)) {
    console.log(`Chat with Azure OpenAI endpoint: ${keys.azureOpenai.endpoint} , deployment: ${keys.azureOpenai.deploymentName}`)
    chat = new AzureChatOpenAI({
      azureOpenAIEndpoint: getProxyEndpoint(keys.azureOpenai.endpoint, keys.azureOpenai.proxy),
      azureOpenAIApiKey: keys.azureOpenai.key,
      azureOpenAIApiDeploymentName: keys.azureOpenai.deploymentName,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.anthropic && ANTHROPIC_MODELS.includes(modelName)) {
    console.log("Chat with Anthropic, host:", keys.anthropic.endpoint)
    chat = new ChatAnthropic({
      anthropicApiUrl: getProxyEndpoint(keys.anthropic.endpoint, keys.anthropic.proxy),
      anthropicApiKey: keys.anthropic.key,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.moonshot && MOONSHOT_MODELS.includes(modelName)) {
    // Reuse openai's sdk
    const endpoint = keys.moonshot.endpoint || "https://api.moonshot.cn/v1"
    console.log("Chat with Moonshot, host:", endpoint)
    chat = new ChatOpenAI({
      configuration: {
        baseURL: endpoint,
      },
      openAIApiKey: keys.moonshot.key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.gemini && GEMINI_MODELS.includes(modelName)) {
    console.log(`Chat with Gemini ${modelName}, host:`, keys.gemini.endpoint)
    chat = new ChatGoogleGenerativeAI({
      apiVersion: "v1beta",
      apiKey: keys.gemini.key,
      modelName: modelName,
      baseUrl: getProxyEndpoint(keys.gemini.endpoint, keys.gemini.proxy),
    })
  } else if (family === MODEL_FAMILIES.groq && GROQ_MODELS.includes(modelName)) {
    // @langchain/grop does not support configuring groq's baseURL, but groq sdk supports receiving environment variables.
    if (keys.groq.endpoint) {
      process.env.GROQ_BASE_URL = getProxyEndpoint(keys.groq.endpoint, keys.groq.proxy)
    }
    console.log(`Chat with Groq ${modelName}`)
    chat = new ChatGroq({
      apiKey: keys.groq.key,
      verbose: true,
      modelName: modelName,
    })
  } else {
    console.log("Chat with Ollama, host:", keys.ollama.endpoint)
    chat = new ChatOllama({
      baseUrl: keys.ollama.endpoint,
      model: modelName,
      numPredict: 3000
    })
  };

  return chat
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

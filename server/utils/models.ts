import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama"
import { Embeddings } from "@langchain/core/embeddings"
import { OpenAIEmbeddings } from "@langchain/openai"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/community/chat_models/ollama"
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatGroq } from "@langchain/groq"
import { AzureChatOpenAI } from "@langchain/azure-openai"
import { type H3Event } from 'h3'
import { type Ollama } from 'ollama'
import { type ContextKeys } from '~/server/middleware/keys'
import { proxyTokenGenerate } from '~/server/utils/proxyToken'

export const MODEL_FAMILIES = {
  openai: 'OpenAI',
  azureOpenai: 'Azure OpenAI',
  anthropic: 'Anthropic',
  moonshot: 'Moonshot',
  gemini: 'Gemini',
  groq: 'Groq'
}

export const OPENAI_GPT_MODELS = [
  "gpt-3.5-turbo",
  "gpt-4",
  "gpt-4-32k",
  "gpt-4-turbo-preview"
]

export const AZURE_OPENAI_GPT_MODELS = [
  "gpt-3.5-turbo",
  "gpt-35-turbo-16k",
  "gpt-35-turbo-instruct",
  "gpt-4",
  "gpt-4-32k"
]

export const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-large",
  "text-embedding-3-small",
  "text-embedding-ada-002"
]

export const GEMINI_EMBEDDING_MODELS = [
  "embedding-001"
]

export const ANTHROPIC_MODELS = [
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2"
]

export const MOONSHOT_MODELS = [
  "moonshot-v1-8k",
  "moonshot-v1-32k",
  "moonshot-v1-128k"
]

export const GEMINI_MODELS = [
  "gemini-1.0-pro",
  "gemini-1.0-pro-vision-latest"
]

export const GROQ_MODELS = [
  "llama3-8b-8192",
  "llama3-70b-8192",
  "llama2-70b-4096",
  "mixtral-8x7b-32768",
  "gemma-7b-it"
]

export const isOllamaModelExists = async (ollama: Ollama, embeddingModelName: string) => {
  if (!OPENAI_EMBEDDING_MODELS.includes(embeddingModelName) && !GEMINI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    const res = await ollama.list()
    return res.models.some(model => model.name.includes(embeddingModelName))
  }

  return true
}

export const createEmbeddings = (embeddingModelName: string, event: H3Event): Embeddings => {
  const keys = event.context.keys
  if (OPENAI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for OpenAI model: ${embeddingModelName}, host: ${keys.openai.endpoint}`)
    return new OpenAIEmbeddings({
      configuration: {
        baseURL: getProxyEndpoint(keys.openai.endpoint, keys.openai.proxy, keys),
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
    console.log("Chat with OpenAI, host:", keys.openai.endpoint)
    chat = new ChatOpenAI({
      configuration: {
        baseURL: getProxyEndpoint(keys.openai.endpoint, keys.openai.proxy, keys),
      },
      openAIApiKey: keys.openai.key,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.azureOpenai && AZURE_OPENAI_GPT_MODELS.includes(modelName)) {
    console.log(`Chat with Azure OpenAI endpoint: ${keys.azureOpenai.endpoint} , deployment: ${keys.azureOpenai.deploymentName}`)
    chat = new AzureChatOpenAI({
      azureOpenAIEndpoint: getProxyEndpoint(keys.azureOpenai.endpoint, keys.azureOpenai.proxy, keys),
      azureOpenAIApiKey: keys.azureOpenai.key,
      azureOpenAIApiDeploymentName: keys.azureOpenai.deploymentName,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.anthropic && ANTHROPIC_MODELS.includes(modelName)) {
    console.log("Chat with Anthropic, host:", keys.anthropic.endpoint)
    chat = new ChatAnthropic({
      anthropicApiUrl: getProxyEndpoint(keys.anthropic.endpoint, keys.anthropic.proxy, keys),
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
    console.log(`Chat with Gemini ${modelName}`)
    chat = new ChatGoogleGenerativeAI({
      apiKey: keys.gemini.key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.groq && GROQ_MODELS.includes(modelName)) {
    // @langchain/grop does not support configuring groq's baseURL, but groq sdk supports receiving environment variables.
    if (keys.groq.endpoint) {
      process.env.GROQ_BASE_URL = getProxyEndpoint(keys.groq.endpoint, keys.groq.proxy, keys)
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
    })
  };

  return chat
}

function getProxyEndpoint(endpoint: string, useProxy: boolean, keys: ContextKeys) {
  const port = process.env.PORT || 3000
  if (useProxy && endpoint && keys.proxyEnabled && keys.proxyUrl) {
    console.log('Proxy:', endpoint, '->', keys.proxyUrl)

    const link = `http://${process.env.HOST || 'localhost'}:${port}/api/proxy?token=${proxyTokenGenerate()}&proxyUrl=${keys.proxyUrl}&endpoint=${endpoint}` // keep endpoint param at the end
    console.log('Proxy link:', link)
    return link
  }
  return endpoint ?? undefined
}

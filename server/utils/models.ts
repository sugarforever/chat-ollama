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
import { type KEYS } from '@/server/middleware/keys'
import { type Ollama } from 'ollama'

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
  if (OPENAI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for OpenAI model: ${embeddingModelName}, host: keys.x_openai_api_host`)
    const keys = event.context.keys as Record<KEYS, string>
    return new OpenAIEmbeddings({
      configuration: {
        baseURL: keys.x_openai_api_host || undefined,
      },
      modelName: embeddingModelName,
      openAIApiKey: keys.x_openai_api_key
    })
  } else if (GEMINI_EMBEDDING_MODELS.includes(embeddingModelName)) {
    console.log(`Creating embeddings for Gemini model: ${embeddingModelName}`)
    const keys = event.context.keys as Record<KEYS, string>
    return new GoogleGenerativeAIEmbeddings({
      modelName: embeddingModelName,
      apiKey: keys.x_gemini_api_key
    })
  } else {
    console.log(`Creating embeddings for Ollama served model: ${embeddingModelName}`)
    return new OllamaEmbeddings({
      model: embeddingModelName,
      baseUrl: event.context?.ollama?.host
    })
  }
}

export const createChatModel = (modelName: string, family: string, event: H3Event): BaseChatModel => {
  const { host } = event.context.ollama
  const keys = event.context.keys as Record<KEYS, string>
  let chat = null
  if (family === MODEL_FAMILIES.openai && OPENAI_GPT_MODELS.includes(modelName)) {
    console.log("Chat with OpenAI, host:", keys.x_openai_api_host)
    chat = new ChatOpenAI({
      configuration: {
        baseURL: keys.x_openai_api_host || undefined,
      },
      openAIApiKey: keys.x_openai_api_key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.azureOpenai && AZURE_OPENAI_GPT_MODELS.includes(modelName)) {
    console.log(`Chat with Azure OpenAI endpoint: ${keys.x_azure_openai_endpoint} , deployment: ${keys.x_azure_openai_deployment_name}`)
    chat = new AzureChatOpenAI({
      azureOpenAIEndpoint: keys.x_azure_openai_endpoint,
      azureOpenAIApiKey: keys.x_azure_openai_api_key,
      azureOpenAIApiDeploymentName: keys.x_azure_openai_deployment_name,
      modelName: modelName,
    })
  } else if (family === MODEL_FAMILIES.anthropic && ANTHROPIC_MODELS.includes(modelName)) {
    console.log("Chat with Anthropic, host:", keys.x_anthropic_api_host)
    chat = new ChatAnthropic({
      anthropicApiUrl: keys.x_anthropic_api_host || undefined,
      anthropicApiKey: keys.x_anthropic_api_key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.moonshot && MOONSHOT_MODELS.includes(modelName)) {
    // Reuse openai's sdk
    console.log("Chat with Moonshot, host:", keys.x_moonshot_api_host)
    chat = new ChatOpenAI({
      configuration: {
        baseURL: keys.x_moonshot_api_host || "https://api.moonshot.cn/v1",
      },
      openAIApiKey: keys.x_moonshot_api_key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.gemini && GEMINI_MODELS.includes(modelName)) {
    console.log(`Chat with Gemini ${modelName}`)
    chat = new ChatGoogleGenerativeAI({
      apiKey: keys.x_gemini_api_key,
      modelName: modelName
    })
  } else if (family === MODEL_FAMILIES.groq && GROQ_MODELS.includes(modelName)) {
    // @langchain/grop does not support configuring groq's baseURL, but groq sdk supports receiving environment variables.
    if (keys.x_groq_api_host) {
      process.env.GROQ_BASE_URL = keys.x_groq_api_host
    }
    console.log(`Chat with Groq ${modelName}`)
    chat = new ChatGroq({
      apiKey: keys.x_groq_api_key,
      verbose: true,
      modelName: modelName,
    })
  } else {
    console.log("Chat with Ollama, host:", host)
    chat = new ChatOllama({
      baseUrl: host,
      model: modelName,
    })
  };

  return chat
}

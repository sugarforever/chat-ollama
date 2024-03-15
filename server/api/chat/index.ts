import ollama from 'ollama';
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { formatDocumentsAsString } from "langchain/util/document";
import { RunnableSequence, RunnablePassthrough, RunnableMap } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ollamaHost, openAiApiKey, anthropicApiKey } from '@/utils/settings'

// todo: 这个文件似乎是多余的
export default defineEventHandler(async (event) => {
  const { model, content } = await readBody(event);

  let chat = null;
  if (OPENAI_GPT_MODELS.includes(model)) {
    console.log("Chat with OpenAI");
    chat = new ChatOpenAI({
      openAIApiKey: openAiApiKey.value,
      modelName: model
    })
  } else if (ANTHROPIC_MODELS.includes(model)) {
    console.log("Chat with Anthropic");
    chat = new ChatAnthropic({
      anthropicApiKey: anthropicApiKey.value,
      modelName: model
    })
  } else {
    console.log("Chat with Ollama");
    chat = new ChatOllama({
      baseUrl: ollamaHost.value,
      model: model,
    })
  };

  const message = { role: 'user', content: content };
  return await ollama.chat({ model: model, messages: [message], stream: false });
})

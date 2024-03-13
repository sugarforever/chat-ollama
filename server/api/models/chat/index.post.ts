import { Ollama } from 'ollama';
import { Readable } from 'stream';
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { setEventStreamResponse, FetchWithAuth } from '@/server/utils';
import { OPENAI_GPT_MODELS, ANTHROPIC_MODELS } from '@/server/utils/models';
import { ChatOpenAI } from '@langchain/openai';
import prisma from "@/server/utils/prisma";
import { createEmbeddings } from '@/server/utils/models';

const SYSTEM_TEMPLATE = `Answer the user's questions based on the below context.
Your answer should be in the format of Markdown.

If the context doesn't contain any relevant information to the question, don't make something up and just say "I don't know":

<context>
{context}
</context>
`;

export default defineEventHandler(async (event) => {
  setEventStreamResponse(event);

  const { host, username, password } = event.context.ollama;
  const { x_openai_api_key: openai_api_key, x_anthropic_api_key: anthropic_api_key } = event.context.keys;
  const { knowledgebaseId, model, messages, stream } = await readBody(event);

  if (knowledgebaseId) {
    console.log("Chat with knowledge base with id: ", knowledgebaseId);
    const knowledgebase = await prisma.knowledgeBase.findUnique({
      where: {
        id: knowledgebaseId,
      },
    });
    console.log(`Knowledge base ${knowledgebase?.name} with embedding "${knowledgebase?.embedding}"`);
    if (!knowledgebase) {
      setResponseStatus(event, 404, `Knowledge base with id ${knowledgebaseId} not found`);
      return;
    }

    const embeddings = createEmbeddings(knowledgebase.embedding, event);
    const retriever = new Chroma(embeddings, {
      collectionName: `collection_${knowledgebase.id}`,
      url: process.env.CHROMADB_URL
    }).asRetriever(4);

    const questionAnsweringPrompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      new MessagesPlaceholder("messages"),
    ]);

    let chat = null;
    if (OPENAI_GPT_MODELS.includes(model)) {
      console.log("Chat with OpenAI");
      chat = new ChatOpenAI({
        openAIApiKey: openai_api_key,
        modelName: model
      })
    } else if (ANTHROPIC_MODELS.includes(model)) {
      console.log("Chat with Anthropic");
      chat = new ChatAnthropic({
        anthropicApiKey: anthropic_api_key,
        modelName: model
      })
    } else {
      console.log("Chat with Ollama");
      chat = new ChatOllama({
        baseUrl: host,
        model: model,
      })
    };

    const query = messages[messages.length - 1].content
    console.log("User query: ", query);

    const relevant_docs = await retriever.invoke(query);
    console.log("Relevant documents: ", relevant_docs);

    const documentChain = await createStuffDocumentsChain({
      llm: chat,
      prompt: questionAnsweringPrompt,
    });

    const parseRetrieverInput = (params) => {
      return params.messages[params.messages.length - 1].content;
    };

    const retrievalChain = RunnablePassthrough.assign({
      context: RunnableSequence.from([parseRetrieverInput, retriever]),
    }).assign({
      answer: documentChain,
    });

    const response = await retrievalChain.stream({
      messages: [new HumanMessage(query)],
    });

    console.log(response);
    const readableStream = Readable.from((async function* () {
      for await (const chunk of response) {
        const message = {
          message: {
            role: 'assistant',
            content: chunk?.answer
          }
        };
        yield `${JSON.stringify(message)}\n\n`;
      }
    })());
    return sendStream(event, readableStream);
  } else {
    const ollama = new Ollama({ host, fetch: FetchWithAuth.bind({ username, password }) });

    const response = await ollama.chat({ model, messages, stream });

    const readableStream = Readable.from((async function* () {
      for await (const chunk of response) {
        yield `${JSON.stringify(chunk)}\n\n`;
      }
    })());
    return sendStream(event, readableStream);
  }
})

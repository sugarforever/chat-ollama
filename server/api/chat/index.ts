import ollama from 'ollama';
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { formatDocumentsAsString } from "langchain/util/document";
import { RunnableSequence, RunnablePassthrough, RunnableMap } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

export default defineEventHandler(async (event) => {
  const { model, content, knowledgebase } = await readBody(event);
  console.log('Model to chat with:', model);
  console.log('Knowledge base: ', knowledgebase);

  if (knowledgebase) {
    const vectorStore = new Chroma(new OpenAIEmbeddings(), {
      collectionName: knowledgebase
    });

    const retriever = vectorStore.asRetriever();
    const prompt = `
    You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.
    Question: {question}
    Context: {context}
    Answer:
    `;
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const ragChainFromDocs = RunnableSequence.from([
      RunnablePassthrough.assign({ context: (input) => formatDocumentsAsString(input.context) }),
      prompt,
      llm,
      new StringOutputParser()
    ]);
    let ragChainWithSource = new RunnableMap({ steps: { context: retriever, question: new RunnablePassthrough() } })
    ragChainWithSource = ragChainWithSource.assign({ answer: ragChainFromDocs });
    return ragChainWithSource.stream(content);
  } else {
    const message = { role: 'user', content: content };
    return await ollama.chat({ model: model, messages: [message], stream: false });
  }
})
